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

// ---- rec-engine tuning knobs (heuristics — tune freely) ----
const COLD_THRESHOLD = 15;    // < this many swipes -> cold start (seed from loved titles)
const NEG_GENRE_THRESHOLD = -3; // genres at/below this score are filtered out of the pool
const WILD_RANK_LO = 3;       // wildcard genres come from profile rank 4..8 (0-indexed 3..7)
const WILD_RANK_HI = 8;

// ---- per-medium TMDB surface + field mapping ----
// Movies and TV differ in endpoints AND field names; everything downstream
// goes through normalize() so cards/tags stay medium-blind.
const MEDIA = {
  movie: {
    discover: '/discover/movie',
    trending: '/trending/movie/week',
    search: '/search/movie',
    detail: (id) => `/movie/${id}`,
    recommendations: (id) => `/movie/${id}/recommendations`,
    genreList: '/genre/movie/list',
    dateGte: 'primary_release_date.gte',
  },
  tv: {
    discover: '/discover/tv',
    trending: '/trending/tv/week',
    search: '/search/tv',
    detail: (id) => `/tv/${id}`,
    recommendations: (id) => `/tv/${id}/recommendations`,
    genreList: '/genre/tv/list',
    dateGte: 'first_air_date.gte',
  },
};
const isMedium = (m) => m === 'movie' || m === 'tv';
const asMedium = (m) => (isMedium(m) ? m : 'movie');

const genreMap = { movie: {}, tv: {} }; // medium -> { id -> human name }, loaded once at boot

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

// movie_cache (SQLite) survives restarts -> far fewer TMDB calls.
async function getDetails(medium, id) {
  const cached = db.getCachedMovie(medium, id);
  if (cached) return cached;
  const d = await tmdb(MEDIA[medium].detail(id), { append_to_response: 'keywords,credits,videos' });
  db.putCachedMovie(medium, id, d);
  return d;
}

// One place that flattens the movie/tv field differences.
function normalize(medium, d) {
  const title = medium === 'tv' ? (d.name || d.original_name) : (d.title || d.original_title);
  const dateStr = medium === 'tv' ? d.first_air_date : d.release_date;
  const year = dateStr ? Number(dateStr.slice(0, 4)) : null;
  const runtime = medium === 'tv'
    ? (Array.isArray(d.episode_run_time) && d.episode_run_time.length ? d.episode_run_time[0] : null)
    : (d.runtime || null);
  const crew = (d.credits && d.credits.crew) || [];
  const creator = medium === 'tv'
    ? ((d.created_by && d.created_by[0] && d.created_by[0].name) || null)
    : (crew.find((c) => c.job === 'Director')?.name || null);
  return { title, year: Number.isFinite(year) ? year : null, runtime, creator, dateStr: dateStr || null };
}

// ---- THE single source of truth for tag keys (100% internal to the backend) ----
function buildTags(medium, d) {
  const tags = new Set();
  for (const g of d.genres || []) tags.add(`genre:${g.id}`);
  // movie keywords live under keywords.keywords; tv under keywords.results
  const kws = (d.keywords && (d.keywords.keywords || d.keywords.results)) || [];
  for (const k of kws.slice(0, 8)) tags.add(`kw:${k.name}`);
  const { creator } = normalize(medium, d);
  if (creator) tags.add(`person:${creator}`);
  const cast = (d.credits && d.credits.cast) || [];
  for (const c of cast.slice(0, 3)) tags.add(`person:${c.name}`);
  if (d.original_language) tags.add(`lang:${d.original_language}`);
  const { year } = normalize(medium, d);
  if (year) tags.add(`decade:${Math.floor(year / 10) * 10}s`);
  return [...tags];
}

const LANG = { en: 'English', ja: 'Japanese', ko: 'Korean', fr: 'French', es: 'Spanish',
  de: 'German', it: 'Italian', hi: 'Hindi', zh: 'Chinese', ru: 'Russian', sv: 'Swedish' };

function labelForTag(medium, tag) {
  const i = tag.indexOf(':');
  const kind = tag.slice(0, i);
  const val = tag.slice(i + 1);
  if (kind === 'genre') return genreMap[medium][val] || 'that genre';
  if (kind === 'lang') return LANG[val] || val.toUpperCase();
  return val; // kw, person, decade already human
}

function buildReason(medium, tags, profile) {
  if (!profile || !profile.tags) return null;
  const top = tags
    .map((t) => [t, profile.tags[t] || 0])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  if (!top.length) return null;
  return 'Because you like ' + top.map(([t]) => labelForTag(medium, t)).join(' & ');
}

// first YouTube Trailer, else first YouTube Teaser, else null
function trailerKey(d) {
  const yt = ((d.videos && d.videos.results) || []).filter((v) => v.site === 'YouTube');
  const pick = yt.find((v) => v.type === 'Trailer') || yt.find((v) => v.type === 'Teaser');
  return pick ? pick.key : null;
}

// Card: no `tags` field (contract v2 — tags are internal only)
function toCard(medium, d, profile) {
  const n = normalize(medium, d);
  return {
    id: d.id,
    title: n.title,
    year: n.year,
    rating: d.vote_average != null ? Number(d.vote_average.toFixed(1)) : 0,
    runtime: n.runtime,
    genres: (d.genres || []).map((g) => g.name),
    overview: d.overview || '',
    poster: d.poster_path ? `${IMG}/w500${d.poster_path}` : '',
    backdrop: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : null,
    trailerKey: trailerKey(d),
    reason: buildReason(medium, buildTags(medium, d), profile),
    isWildcard: false,
  };
}

function toDetail(medium, d, profile) {
  const n = normalize(medium, d);
  const cast = ((d.credits && d.credits.cast) || []).slice(0, 6).map((c) => ({
    name: c.name,
    character: c.character || null,
    photo: c.profile_path ? `${IMG}/w185${c.profile_path}` : null,
  }));
  return {
    ...toCard(medium, d, profile),
    tagline: d.tagline || null,
    director: n.creator, // "creator" for tv, "director" for movies — same slot
    cast,
    releaseDate: n.dateStr,
  };
}

const currentProfile = (medium) => ({ tags: db.getProfileTags(medium) });

async function cardsForList(medium, list, profile) {
  const ids = db.getList(medium, list);
  const cards = await Promise.all(ids.map(async (id) => {
    try { return toCard(medium, await getDetails(medium, id), profile); } catch { return null; }
  }));
  return cards.filter(Boolean);
}

// ---- pool page fetchers (page cursors cycle so repeat calls return fresh titles) ----
const cursors = {}; // key `${medium}:${kind}` -> current page
const bump = (n) => (n >= 500 ? 1 : n + 1);

async function discoverPage(medium, { withGenres, withoutGenres, page }) {
  const params = {
    include_adult: 'false',
    'vote_count.gte': '100',
    sort_by: 'popularity.desc',
    page: String(page),
  };
  if (withGenres && withGenres.length) params.with_genres = withGenres.join('|'); // OR
  if (withoutGenres && withoutGenres.length) params.without_genres = withoutGenres.join(','); // AND-NOT
  const data = await tmdb(MEDIA[medium].discover, params);
  return (data.results || []).filter(passesFilters);
}

async function trendingPage(medium, page) {
  const data = await tmdb(MEDIA[medium].trending, { page: String(page) });
  return (data.results || []).filter(passesFilters);
}

async function recommendationsPage(medium, sourceId, page) {
  const data = await tmdb(MEDIA[medium].recommendations(sourceId), { page: String(page) });
  return (data.results || []).filter(passesFilters);
}

// Pull consecutive pages via `fetchPage(page)` until we have `needed` fresh ids
// or `maxPages` run out. Cursor per (medium, kind) so repeat calls stay fresh.
async function collectIds(cursorKey, fetchPage, needed, excludeSet, seen, maxPages = 6) {
  let cursor = cursors[cursorKey] || 1;
  const ids = [];
  for (let pages = 0; ids.length < needed && pages < maxPages; pages++) {
    let results = [];
    try { results = await fetchPage(cursor); } catch { results = []; } // skip bad page, don't 500
    for (const m of results) {
      if (excludeSet.has(m.id) || seen.has(m.id)) continue;
      seen.add(m.id);
      ids.push(m.id);
    }
    cursor = bump(cursor);
  }
  cursors[cursorKey] = cursor;
  return ids;
}

// rank genre tags by score, return the TMDB ids in [lo, hi)
function rankedGenres(tagScores, lo, hi) {
  return Object.entries(tagScores)
    .filter(([k, v]) => k.startsWith('genre:') && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(lo, hi)
    .map(([k]) => k.slice('genre:'.length));
}

function negativeGenres(tagScores) {
  return Object.entries(tagScores)
    .filter(([k, v]) => k.startsWith('genre:') && v <= NEG_GENRE_THRESHOLD)
    .map(([k]) => k.slice('genre:'.length));
}

// ---- app ----
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/genres', (req, res) => {
  const medium = asMedium(req.query.medium);
  res.json({ genres: Object.entries(genreMap[medium]).map(([id, name]) => ({ id: Number(id), name })) });
});

app.get('/api/search', async (req, res) => {
  const medium = asMedium(req.query.medium);
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json({ results: [] });
  let hits = [];
  try {
    const data = await tmdb(MEDIA[medium].search, { query: q, include_adult: 'false' });
    hits = (data.results || []).filter(passesFilters).slice(0, 12);
  } catch {
    return res.json({ results: [] });
  }
  const profile = currentProfile(medium);
  const cards = await Promise.all(hits.map(async (m) => {
    try { return toCard(medium, await getDetails(medium, m.id), profile); } catch { return null; }
  }));
  res.json({ results: cards.filter(Boolean) });
});

app.get('/api/state', async (req, res) => {
  const medium = asMedium(req.query.medium);
  const profile = currentProfile(medium);
  const [watchlist, seenLoved] = await Promise.all([
    cardsForList(medium, 'watchlist', profile),
    cardsForList(medium, 'seenLoved', profile),
  ]);
  res.json({
    onboarded: db.hasProfile(medium),
    hintsSeen: db.getSetting('hintsSeen') === 'true',
    watchlist,
    seenLoved,
    swipeCount: db.swipeCount(medium),
  });
});

app.get('/api/movie/:id', async (req, res) => {
  const medium = asMedium(req.query.medium);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  try {
    res.json({ movie: toDetail(medium, await getDetails(medium, id), currentProfile(medium)) });
  } catch {
    res.status(502).json({ error: 'movie fetch failed' });
  }
});

// Seed the scorecard straight into the DB (no profile returned).
app.post('/api/onboard', async (req, res) => {
  const medium = asMedium(req.body.medium);
  const genreIds = Array.isArray(req.body.genreIds) ? req.body.genreIds : [];
  const lovedIds = Array.isArray(req.body.lovedIds) ? req.body.lovedIds : [];
  const now = Date.now();

  for (const g of genreIds) db.bumpTag(medium, `genre:${g}`, 2);
  for (const id of lovedIds) {
    try {
      for (const t of buildTags(medium, await getDetails(medium, id))) db.bumpTag(medium, t, 4);
    } catch { /* skip a title that fails to fetch */ }
    db.exclude(medium, Number(id), null);            // already loved -> never show again
    db.addToList(medium, Number(id), 'seenLoved', now); // seed cold-start recs + populate the shelf
  }
  res.json({ ok: true });
});

// The single write path for the 6 signals.
app.post('/api/action', async (req, res) => {
  const medium = asMedium(req.body.medium);
  const movieId = Number(req.body.movieId);
  const action = String(req.body.action || '');
  if (!Number.isFinite(movieId) || !(action in WEIGHTS)) {
    return res.status(400).json({ ok: false, error: 'bad movieId or action' });
  }
  const weight = WEIGHTS[action];
  const now = Date.now();

  let tags = [];
  try { tags = buildTags(medium, await getDetails(medium, movieId)); }
  catch { /* still record the signal even if TMDB details fail */ }

  for (const t of tags) db.bumpTag(medium, t, weight);
  db.logAction(medium, movieId, action, weight, now);

  // meh -> temporary exclusion; everything else -> forever
  db.exclude(medium, movieId, action === 'meh' ? now + MEH_TTL_MS : null);

  if (action === 'save') db.addToList(medium, movieId, 'watchlist', now);
  if (action === 'seenLoved') db.addToList(medium, movieId, 'seenLoved', now);

  res.json({ ok: true, watchlistCount: db.listCount(medium, 'watchlist') });
});

app.post('/api/next', async (req, res) => {
  const medium = asMedium(req.body.medium);
  const count = Number(req.body.count) || 10;
  const inQueue = Array.isArray(req.body.inQueue) ? req.body.inQueue : [];
  const tagScores = db.getProfileTags(medium);
  const profile = { tags: tagScores };

  const now = Date.now();
  // active exclusions (forever OR not-yet-expired) UNION the deck the frontend already holds
  const exclude = new Set(db.activeExclusions(medium, now));
  for (const id of inQueue) exclude.add(id);

  const wildCount = Math.round(count * 0.3);
  const mainCount = count - wildCount;

  const topGenres = rankedGenres(tagScores, 0, WILD_RANK_LO);   // rank 1..3 -> main
  const wildGenres = rankedGenres(tagScores, WILD_RANK_LO, WILD_RANK_HI); // rank 4..8 -> wildcards
  const withoutGenres = negativeGenres(tagScores);             // filter disliked genres out
  const cold = db.swipeCount(medium) < COLD_THRESHOLD;
  const lovedSeeds = db.getList(medium, 'seenLoved');           // cold-start recommendation seeds

  const seen = new Set(); // shared across pools -> no dupes between main and wildcard

  // MAIN pool: cold + has loved seeds -> TMDB recommendations of those titles.
  //            otherwise -> discover on top genres, minus disliked genres.
  let mainIds;
  if (cold && lovedSeeds.length) {
    const seed = lovedSeeds[Math.floor(Math.random() * Math.min(lovedSeeds.length, 5))];
    mainIds = await collectIds(
      `${medium}:recs`, (page) => recommendationsPage(medium, seed, page),
      mainCount * 2 + 3, exclude, seen,
    );
    // recommendations can run dry -> top up from genre discover
    if (mainIds.length < mainCount) {
      const more = await collectIds(
        `${medium}:main`, (page) => discoverPage(medium, { withGenres: topGenres, withoutGenres, page }),
        mainCount * 2 + 3 - mainIds.length, exclude, seen,
      );
      mainIds = mainIds.concat(more);
    }
  } else {
    mainIds = await collectIds(
      `${medium}:main`, (page) => discoverPage(medium, { withGenres: topGenres, withoutGenres, page }),
      mainCount * 2 + 3, exclude, seen,
    );
  }

  // WILD pool: taste-adjacent (next-tier genres). Only fall back to raw trending
  // when there is no adjacency signal to key off (cold / thin profile).
  const wildFetch = wildGenres.length
    ? (page) => discoverPage(medium, { withGenres: wildGenres, withoutGenres, page })
    : (page) => trendingPage(medium, page);
  const wildKey = wildGenres.length ? `${medium}:wild` : `${medium}:trend`;
  const wildIds = await collectIds(wildKey, wildFetch, wildCount + 3, exclude, seen);

  const build = async (ids, isWild) => {
    const items = await Promise.all(ids.map(async (id) => {
      try {
        const d = await getDetails(medium, id);
        if (exclude.has(d.id)) return null;
        const card = toCard(medium, d, profile);
        card.isWildcard = isWild;
        const fit = buildTags(medium, d).reduce((s, t) => s + (tagScores[t] || 0), 0);
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
  db.resetAll(); // wipes both media, everything except movie_cache
  res.json({ ok: true });
});

async function loadGenres() {
  for (const medium of ['movie', 'tv']) {
    const data = await tmdb(MEDIA[medium].genreList, {});
    for (const g of data.genres || []) genreMap[medium][g.id] = g.name;
  }
}

function runSelfTest() {
  const assert = require('assert');
  Object.assign(genreMap.movie, { 878: 'Science Fiction', 53: 'Thriller' });
  Object.assign(genreMap.tv, { 10765: 'Sci-Fi & Fantasy', 18: 'Drama' });

  const movie = {
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
  const tags = buildTags('movie', movie);
  assert(tags.includes('genre:878') && tags.includes('kw:dream'));
  assert(tags.includes('person:Christopher Nolan') && tags.includes('lang:en'));
  assert(tags.includes('decade:2010s'));
  assert.equal(tags.filter((t) => t.startsWith('person:')).length, 4); // 1 director + top 3 cast
  assert(!tags.includes('person:Not Billed'));

  const profile = { tags: { 'genre:878': 5, 'person:Christopher Nolan': 4 } };
  const card = toCard('movie', movie, profile);
  assert.equal(card.rating, 8.4);
  assert.equal(card.year, 2010);
  assert.equal(card.reason, 'Because you like Science Fiction & Christopher Nolan');
  assert.equal(card.trailerKey, 'realTrailer');
  assert(!('tags' in card));
  const fit = tags.reduce((s, t) => s + (profile.tags[t] || 0), 0);
  assert.equal(fit, 9);

  const detail = toDetail('movie', movie, profile);
  assert.equal(detail.director, 'Christopher Nolan');
  assert.equal(detail.cast.length, 4);
  assert.equal(detail.releaseDate, '2010-07-16');

  // ---- TV path: name/first_air_date/episode_run_time/created_by/keywords.results ----
  const tv = {
    id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', vote_average: 8.9,
    episode_run_time: [45], overview: 'y', poster_path: '/bb.jpg', backdrop_path: '/bbb.jpg',
    original_language: 'en', tagline: 'Change the equation.',
    genres: [{ id: 18, name: 'Drama' }, { id: 10765, name: 'Sci-Fi & Fantasy' }],
    keywords: { results: [{ name: 'chemistry' }, { name: 'drugs' }] },
    created_by: [{ name: 'Vince Gilligan' }],
    videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'bbTrailer' }] },
    credits: { crew: [], cast: [{ name: 'Bryan Cranston', character: 'Walter White', profile_path: '/bc.jpg' }] },
  };
  const tvTags = buildTags('tv', tv);
  assert(tvTags.includes('genre:18') && tvTags.includes('kw:chemistry')); // tv keywords.results read
  assert(tvTags.includes('person:Vince Gilligan'));                       // creator, not crew director
  assert(tvTags.includes('person:Bryan Cranston') && tvTags.includes('decade:2000s'));
  const tvCard = toCard('tv', tv, { tags: {} });
  assert.equal(tvCard.title, 'Breaking Bad');   // name -> title
  assert.equal(tvCard.year, 2008);              // first_air_date -> year
  assert.equal(tvCard.runtime, 45);             // episode_run_time[0] -> runtime
  assert.equal(tvCard.trailerKey, 'bbTrailer');
  const tvDetail = toDetail('tv', tv, { tags: {} });
  assert.equal(tvDetail.director, 'Vince Gilligan'); // creator fills the director slot
  assert.equal(tvDetail.releaseDate, '2008-01-20');

  // genre maps stay separate (same id 18 means different things per medium context)
  assert.equal(labelForTag('tv', 'genre:18'), 'Drama');
  assert.equal(labelForTag('movie', 'genre:53'), 'Thriller');
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
