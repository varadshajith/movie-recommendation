require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const TMDB_KEY = process.env.TMDB_KEY;
const PORT = 8181;
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

// contract v2: the 6 signals and their weights
const WEIGHTS = { nope: -2, like: 2, meh: -0.5, save: 4, seenLoved: 5, seenDisliked: -4 };
const MEH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // "meh" resurfaces after 30 days

const genreMap = {}; // id -> human name (loaded once at boot)

// ---- TMDB fetch (key stays server-side; never returned to client) ----
async function tmdb(path, params = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set('api_key', TMDB_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  return res.json();
}

// Global discovery filters: no adult, must have poster, >=100 votes.
const passesFilters = (m) => !!(m && m.poster_path && (m.vote_count ?? 0) >= 100 && !m.adult);

// movie_cache (SQLite) survives restarts -> far fewer TMDB calls than the old in-memory Map.
async function getDetails(id) {
  const cached = db.getCachedMovie(id);
  if (cached) return cached;
  const d = await tmdb(`/movie/${id}`, { append_to_response: 'keywords,credits,videos' });
  db.putCachedMovie(id, d);
  return d;
}

// ---- THE single source of truth for tag keys (100% internal to the backend now) ----
function buildTags(d) {
  const tags = new Set();
  for (const g of d.genres || []) tags.add(`genre:${g.id}`);
  const kws = (d.keywords && d.keywords.keywords) || [];
  for (const k of kws.slice(0, 8)) tags.add(`kw:${k.name}`);
  const crew = (d.credits && d.credits.crew) || [];
  for (const c of crew) if (c.job === 'Director') tags.add(`person:${c.name}`);
  const cast = (d.credits && d.credits.cast) || [];
  for (const c of cast.slice(0, 3)) tags.add(`person:${c.name}`);
  if (d.original_language) tags.add(`lang:${d.original_language}`);
  const year = d.release_date ? Number(d.release_date.slice(0, 4)) : null;
  if (year) tags.add(`decade:${Math.floor(year / 10) * 10}s`);
  return [...tags];
}

const LANG = { en: 'English', ja: 'Japanese', ko: 'Korean', fr: 'French', es: 'Spanish',
  de: 'German', it: 'Italian', hi: 'Hindi', zh: 'Chinese', ru: 'Russian', sv: 'Swedish' };

function labelForTag(tag) {
  const i = tag.indexOf(':');
  const kind = tag.slice(0, i);
  const val = tag.slice(i + 1);
  if (kind === 'genre') return genreMap[val] || 'that genre';
  if (kind === 'lang') return LANG[val] || val.toUpperCase();
  return val; // kw, person, decade already human
}

function buildReason(tags, profile) {
  if (!profile || !profile.tags) return null;
  const top = tags
    .map((t) => [t, profile.tags[t] || 0])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  if (!top.length) return null;
  return 'Because you like ' + top.map(([t]) => labelForTag(t)).join(' & ');
}

// first YouTube Trailer, else first YouTube Teaser, else null
function trailerKey(d) {
  const yt = ((d.videos && d.videos.results) || []).filter((v) => v.site === 'YouTube');
  const pick = yt.find((v) => v.type === 'Trailer') || yt.find((v) => v.type === 'Teaser');
  return pick ? pick.key : null;
}

// Card: no `tags` field anymore (contract v2 — tags are internal only)
function toCard(d, profile) {
  const year = d.release_date ? Number(d.release_date.slice(0, 4)) : null;
  return {
    id: d.id,
    title: d.title,
    year: Number.isFinite(year) ? year : null,
    rating: d.vote_average != null ? Number(d.vote_average.toFixed(1)) : 0,
    runtime: d.runtime || null,
    genres: (d.genres || []).map((g) => g.name),
    overview: d.overview || '',
    poster: d.poster_path ? `${IMG}/w500${d.poster_path}` : '',
    backdrop: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : null,
    trailerKey: trailerKey(d),
    reason: buildReason(buildTags(d), profile),
    isWildcard: false,
  };
}

function toDetail(d, profile) {
  const crew = (d.credits && d.credits.crew) || [];
  const cast = ((d.credits && d.credits.cast) || []).slice(0, 6).map((c) => ({
    name: c.name,
    character: c.character || null,
    photo: c.profile_path ? `${IMG}/w185${c.profile_path}` : null,
  }));
  return {
    ...toCard(d, profile),
    tagline: d.tagline || null,
    director: crew.find((c) => c.job === 'Director')?.name || null,
    cast,
    releaseDate: d.release_date || null,
  };
}

const currentProfile = () => ({ tags: db.getProfileTags() });

async function cardsForList(list, profile) {
  const ids = db.getList(list);
  const cards = await Promise.all(ids.map(async (id) => {
    try { return toCard(await getDetails(id), profile); } catch { return null; }
  }));
  return cards.filter(Boolean);
}

// ---- pool page fetchers (page cursors cycle so repeat calls return fresh titles) ----
let mainCursor = 1;
let wildCursor = 1;
const bump = (n) => (n >= 500 ? 1 : n + 1);

async function discoverPage(genreIds, page) {
  const params = {
    include_adult: 'false',
    'vote_count.gte': '100',
    sort_by: 'popularity.desc',
    page: String(page),
  };
  if (genreIds.length) params.with_genres = genreIds.join('|'); // OR across top genres
  const data = await tmdb('/discover/movie', params);
  return (data.results || []).filter(passesFilters);
}

async function trendingPage(page) {
  const data = await tmdb('/trending/movie/week', { page: String(page) });
  return (data.results || []).filter(passesFilters);
}

// Pull consecutive pages until we have `needed` fresh ids or pages run out.
async function collectIds(kind, genreIds, needed, excludeSet, seen) {
  const useDiscover = kind === 'main' && genreIds.length > 0;
  let cursor = kind === 'main' ? mainCursor : wildCursor;
  const ids = [];
  for (let pages = 0; ids.length < needed && pages < 6; pages++) {
    let results = [];
    try {
      results = useDiscover ? await discoverPage(genreIds, cursor) : await trendingPage(cursor);
    } catch { results = []; } // skip a bad page rather than 500 the batch
    for (const m of results) {
      if (excludeSet.has(m.id) || seen.has(m.id)) continue;
      seen.add(m.id);
      ids.push(m.id);
    }
    cursor = bump(cursor);
  }
  if (kind === 'main') mainCursor = cursor; else wildCursor = cursor;
  return ids;
}

// ---- app ----
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/genres', (_req, res) => {
  res.json({ genres: Object.entries(genreMap).map(([id, name]) => ({ id: Number(id), name })) });
});

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json({ results: [] });
  let hits = [];
  try {
    const data = await tmdb('/search/movie', { query: q, include_adult: 'false' });
    hits = (data.results || []).filter(passesFilters).slice(0, 12);
  } catch {
    return res.json({ results: [] });
  }
  const profile = currentProfile();
  const cards = await Promise.all(hits.map(async (m) => {
    try { return toCard(await getDetails(m.id), profile); } catch { return null; }
  }));
  res.json({ results: cards.filter(Boolean) });
});

app.get('/api/state', async (_req, res) => {
  const profile = currentProfile();
  const [watchlist, seenLoved] = await Promise.all([
    cardsForList('watchlist', profile),
    cardsForList('seenLoved', profile),
  ]);
  res.json({
    onboarded: db.hasProfile(),
    hintsSeen: db.getSetting('hintsSeen') === 'true',
    watchlist,
    seenLoved,
    swipeCount: db.swipeCount(),
  });
});

app.get('/api/movie/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  try {
    res.json({ movie: toDetail(await getDetails(id), currentProfile()) });
  } catch {
    res.status(502).json({ error: 'movie fetch failed' });
  }
});

// Seed the scorecard straight into the DB (no profile returned).
app.post('/api/onboard', async (req, res) => {
  const genreIds = Array.isArray(req.body.genreIds) ? req.body.genreIds : [];
  const lovedIds = Array.isArray(req.body.lovedIds) ? req.body.lovedIds : [];

  for (const g of genreIds) db.bumpTag(`genre:${g}`, 2);
  for (const id of lovedIds) {
    try {
      for (const t of buildTags(await getDetails(id))) db.bumpTag(t, 4);
    } catch { /* skip a movie that fails to fetch */ }
    db.exclude(Number(id), null); // already loved -> never show it again
  }
  res.json({ ok: true });
});

// The single write path for the 6 signals.
app.post('/api/action', async (req, res) => {
  const movieId = Number(req.body.movieId);
  const action = String(req.body.action || '');
  if (!Number.isFinite(movieId) || !(action in WEIGHTS)) {
    return res.status(400).json({ ok: false, error: 'bad movieId or action' });
  }
  const weight = WEIGHTS[action];
  const now = Date.now();

  let tags = [];
  try { tags = buildTags(await getDetails(movieId)); }
  catch { /* still record the signal even if TMDB details fail */ }

  for (const t of tags) db.bumpTag(t, weight);
  db.logAction(movieId, action, weight, now);

  // meh -> temporary exclusion; everything else -> forever
  db.exclude(movieId, action === 'meh' ? now + MEH_TTL_MS : null);

  if (action === 'save') db.addToList(movieId, 'watchlist', now);
  if (action === 'seenLoved') db.addToList(movieId, 'seenLoved', now);

  res.json({ ok: true, watchlistCount: db.listCount('watchlist') });
});

app.post('/api/next', async (req, res) => {
  const count = Number(req.body.count) || 10;
  const inQueue = Array.isArray(req.body.inQueue) ? req.body.inQueue : [];
  const tagScores = db.getProfileTags(); // scorecard lives in the DB now
  const profile = { tags: tagScores };

  const now = Date.now();
  // active exclusions (forever OR not-yet-expired) UNION the deck the frontend already holds
  const exclude = new Set(db.activeExclusions(now));
  for (const id of inQueue) exclude.add(id);

  const wildCount = Math.round(count * 0.3);
  const mainCount = count - wildCount;

  // top 3 positive genre tags -> main pool; cold profile falls back to trending inside collectIds
  const genreIds = Object.entries(tagScores)
    .filter(([k, v]) => k.startsWith('genre:') && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k.slice('genre:'.length));

  const seen = new Set(); // shared across pools -> no dupes between main and wildcard
  const mainIds = await collectIds('main', genreIds, mainCount * 2 + 3, exclude, seen);
  const wildIds = await collectIds('wild', [], wildCount + 3, exclude, seen);

  const build = async (ids, isWild) => {
    const items = await Promise.all(ids.map(async (id) => {
      try {
        const d = await getDetails(id);
        if (exclude.has(d.id)) return null;
        const card = toCard(d, profile);
        card.isWildcard = isWild;
        const fit = buildTags(d).reduce((s, t) => s + (tagScores[t] || 0), 0);
        return { card, fit };
      } catch { return null; }
    }));
    return items.filter(Boolean);
  };

  let mains = await build(mainIds, false);
  const wilds = (await build(wildIds, true)).slice(0, wildCount);

  mains.sort((a, b) => b.fit - a.fit);
  mains = mains.slice(0, mainCount);

  // interleave wildcards at random positions
  const result = [...mains];
  for (const w of wilds) {
    const pos = Math.floor(Math.random() * (result.length + 1));
    result.splice(pos, 0, w);
  }

  const out = [];
  const usedIds = new Set();
  for (const item of result) {
    if (usedIds.has(item.card.id)) continue; // de-dupe within batch
    usedIds.add(item.card.id);
    out.push(item.card);
    if (out.length >= count) break;
  }
  res.json({ cards: out });
});

app.post('/api/settings', (req, res) => {
  if (typeof req.body.hintsSeen === 'boolean') db.setSetting('hintsSeen', req.body.hintsSeen);
  res.json({ ok: true });
});

app.post('/api/reset', (_req, res) => {
  db.resetAll(); // wipes everything except movie_cache
  res.json({ ok: true });
});

async function loadGenres() {
  const data = await tmdb('/genre/movie/list', {});
  for (const g of data.genres || []) genreMap[g.id] = g.name;
}

function runSelfTest() {
  const assert = require('assert');
  Object.assign(genreMap, { 878: 'Science Fiction', 53: 'Thriller' });
  const d = {
    id: 27205, title: 'Inception', release_date: '2010-07-16', vote_average: 8.369,
    runtime: 148, overview: 'x', poster_path: '/p.jpg', backdrop_path: '/b.jpg',
    original_language: 'en', tagline: 'Your mind is the scene of the crime.',
    genres: [{ id: 878, name: 'Science Fiction' }, { id: 53, name: 'Thriller' }],
    keywords: { keywords: [{ name: 'dream' }, { name: 'heist' }] },
    videos: { results: [
      { site: 'YouTube', type: 'Teaser', key: 'teaseKey' },
      { site: 'YouTube', type: 'Trailer', key: 'realTrailer' },
      { site: 'Vimeo', type: 'Trailer', key: 'ignoreMe' },
    ] },
    credits: {
      crew: [{ job: 'Director', name: 'Christopher Nolan' }, { job: 'Writer', name: 'Nobody' }],
      cast: [{ name: 'Leonardo DiCaprio', character: 'Cobb', profile_path: '/leo.jpg' },
        { name: 'Joseph Gordon-Levitt', character: 'Arthur' },
        { name: 'Elliot Page', character: 'Ariadne' }, { name: 'Not Billed' }],
    },
  };
  const tags = buildTags(d);
  assert(tags.includes('genre:878') && tags.includes('kw:dream'));
  assert(tags.includes('person:Christopher Nolan') && tags.includes('lang:en'));
  assert(tags.includes('decade:2010s'));
  assert.equal(tags.filter((t) => t.startsWith('person:')).length, 4); // 1 director + top 3 cast
  assert(!tags.includes('person:Not Billed')); // 4th cast dropped

  const profile = { tags: { 'genre:878': 5, 'person:Christopher Nolan': 4 } };
  const card = toCard(d, profile);
  assert.equal(card.rating, 8.4);
  assert.equal(card.year, 2010);
  assert.equal(card.reason, 'Because you like Science Fiction & Christopher Nolan');
  assert.equal(card.poster, `${IMG}/w500/p.jpg`);
  assert.equal(card.trailerKey, 'realTrailer'); // Trailer beats Teaser; Vimeo ignored
  assert(!('tags' in card)); // tags gone from the Card payload (contract v2)
  const fit = tags.reduce((s, t) => s + (profile.tags[t] || 0), 0);
  assert.equal(fit, 9);
  assert.equal(toCard(d, { tags: {} }).reason, null); // no positive tags -> null

  const detail = toDetail(d, profile);
  assert.equal(detail.director, 'Christopher Nolan');
  assert.equal(detail.tagline, 'Your mind is the scene of the crime.');
  assert.equal(detail.releaseDate, '2010-07-16');
  assert.equal(detail.cast.length, 4); // top 6 requested, only 4 present
  assert.equal(detail.cast[0].photo, `${IMG}/w185/leo.jpg`);
  assert.equal(detail.cast[1].photo, null); // no profile_path -> null
  assert.equal(detail.cast[0].character, 'Cobb');
  console.log('selftest OK');
}

if (process.argv.includes('--selftest')) {
  runSelfTest();
} else if (!TMDB_KEY || TMDB_KEY === 'your_tmdb_v3_key_here') {
  console.error('Missing TMDB_KEY in reel-backend/.env — get a v3 key at https://www.themoviedb.org/settings/api');
  process.exit(1);
} else {
  loadGenres()
    .then(() => app.listen(PORT, () => console.log(`reel-backend on http://localhost:${PORT}`)))
    .catch((err) => { console.error('Boot failed (genre load):', err.message); process.exit(1); });
}
