require('dotenv').config();
const express = require('express');
const cors = require('cors');

const TMDB_KEY = process.env.TMDB_KEY;
const PORT = 8181;
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

// ---- in-memory caches (no DB) ----
const genreMap = {};             // id -> human name
const detailsCache = new Map();  // id -> raw TMDB details (with keywords+credits)
// ponytail: cache raw details, not the built Card — Card.reason varies by profile,
// so a per-id card cache would be wrong. buildTags/toCard are cheap; the fetch is the cost.

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

async function getDetails(id) {
  if (detailsCache.has(id)) return detailsCache.get(id);
  const d = await tmdb(`/movie/${id}`, { append_to_response: 'keywords,credits' });
  detailsCache.set(id, d);
  return d;
}

// ---- THE single source of truth for tag keys ----
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

function toCard(d, profile) {
  const tags = buildTags(d);
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
    tags,
    reason: buildReason(tags, profile),
    isWildcard: false,
  };
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
  const cards = await Promise.all(hits.map(async (m) => {
    try { return toCard(await getDetails(m.id), null); } catch { return null; }
  }));
  res.json({ results: cards.filter(Boolean) });
});

app.post('/api/onboard', async (req, res) => {
  const genreIds = req.body.genreIds || [];
  const lovedIds = req.body.lovedIds || [];
  const tags = {};
  const add = (t, w) => { tags[t] = (tags[t] || 0) + w; };
  for (const g of genreIds) add(`genre:${g}`, 2);
  for (const id of lovedIds) {
    try {
      for (const t of buildTags(await getDetails(id))) add(t, 4);
    } catch { /* skip a movie that fails to fetch */ }
  }
  res.json({ profile: { tags } });
});

app.post('/api/next', async (req, res) => {
  const profile = req.body.profile || { tags: {}, exclude: [] };
  const tags = profile.tags || {};
  const exclude = new Set(profile.exclude || []);
  const count = Number(req.body.count) || 10;

  const wildCount = Math.round(count * 0.3);
  const mainCount = count - wildCount;

  // top 3 positive genre tags -> main pool; cold profile falls back to trending inside collectIds
  const genreIds = Object.entries(tags)
    .filter(([k, v]) => k.startsWith('genre:') && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k.slice('genre:'.length));

  const seen = new Set(); // shared across pools -> no dupes between main and wildcard
  const mainIds = await collectIds('main', genreIds, mainCount * 2 + 3, exclude, seen);
  const wildIds = await collectIds('wild', [], wildCount + 3, exclude, seen);

  const build = async (ids, isWild) => {
    const cards = await Promise.all(ids.map(async (id) => {
      try { return toCard(await getDetails(id), profile); } catch { return null; }
    }));
    const out = [];
    for (const c of cards) {
      if (!c || exclude.has(c.id)) continue;
      c.isWildcard = isWild;
      c.fit = c.tags.reduce((s, t) => s + (tags[t] || 0), 0);
      out.push(c);
    }
    return out;
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
  for (const c of result) {
    if (usedIds.has(c.id)) continue; // de-dupe within batch
    usedIds.add(c.id);
    const { fit, ...card } = c; // strip internal fit field before returning
    out.push(card);
    if (out.length >= count) break;
  }
  res.json({ cards: out });
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
    original_language: 'en',
    genres: [{ id: 878, name: 'Science Fiction' }, { id: 53, name: 'Thriller' }],
    keywords: { keywords: [{ name: 'dream' }, { name: 'heist' }] },
    credits: {
      crew: [{ job: 'Director', name: 'Christopher Nolan' }, { job: 'Writer', name: 'Nobody' }],
      cast: [{ name: 'Leonardo DiCaprio' }, { name: 'Joseph Gordon-Levitt' },
        { name: 'Elliot Page' }, { name: 'Not Billed' }],
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
  const fit = card.tags.reduce((s, t) => s + (profile.tags[t] || 0), 0);
  assert.equal(fit, 9);
  assert.equal(toCard(d, { tags: {} }).reason, null); // no positive tags -> null
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
