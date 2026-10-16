// Everything that talks to TMDB and turns its raw JSON into what the app needs.
// `medium` is 'movie' or 'tv' — TMDB uses the same URL shape for both, only a
// few field names differ (title/name, release_date/first_air_date, ...).
const db = require('./db');

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

// One TMDB call. The API key stays on the server and is never sent to the browser.
async function tmdb(path, params = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set('api_key', process.env.TMDB_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // TMDB sometimes resets a connection; retry a couple of times before giving up
  let res;
  for (let attempt = 1; ; attempt++) {
    try { res = await fetch(url); break; } catch (err) { if (attempt === 3) throw err; }
  }
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  return res.json();
}

// Only show titles with a poster, 100+ votes and no adult flag.
const passesFilters = (m) => !!(m && m.poster_path && (m.vote_count ?? 0) >= 100 && !m.adult);

// A page of results from any TMDB list endpoint, already filtered.
const listPage = async (path, params) => ((await tmdb(path, params)).results || []).filter(passesFilters);

// Full details of one title, cached in SQLite so we call TMDB once per title.
async function getDetails(medium, id) {
  const cached = db.getCachedMovie(medium, id);
  if (cached) return cached;
  const d = await tmdb(`/${medium}/${id}`, { append_to_response: 'keywords,credits,videos' });
  db.putCachedMovie(medium, id, d);
  return d;
}

// genre id -> name, loaded once at startup (the two media have different lists)
const genreNames = { movie: {}, tv: {} };
async function loadGenres() {
  for (const medium of ['movie', 'tv']) {
    for (const g of (await tmdb(`/genre/${medium}/list`)).genres || []) genreNames[medium][g.id] = g.name;
  }
}

// ---- movie/tv field differences, flattened in one place ----
function normalize(medium, d) {
  const isTv = medium === 'tv';
  const dateStr = (isTv ? d.first_air_date : d.release_date) || null;
  const year = dateStr ? Number(dateStr.slice(0, 4)) : null;
  return {
    title: isTv ? d.name || d.original_name : d.title || d.original_title,
    year: Number.isFinite(year) ? year : null,
    runtime: isTv ? (d.episode_run_time || [])[0] || null : d.runtime || null,
    creator: isTv ? d.created_by?.[0]?.name || null : (d.credits?.crew || []).find((c) => c.job === 'Director')?.name || null,
    dateStr,
  };
}

// The "tags" that describe a title: genres, keywords, people, language, decade.
// The taste profile is a score per tag.
function buildTags(medium, d) {
  const n = normalize(medium, d);
  const tags = new Set();
  for (const g of d.genres || []) tags.add(`genre:${g.id}`);
  for (const k of (d.keywords?.keywords || d.keywords?.results || []).slice(0, 8)) tags.add(`kw:${k.name}`);
  if (n.creator) tags.add(`person:${n.creator}`);
  for (const c of (d.credits?.cast || []).slice(0, 3)) tags.add(`person:${c.name}`);
  if (d.original_language) tags.add(`lang:${d.original_language}`);
  if (n.year) tags.add(`decade:${Math.floor(n.year / 10) * 10}s`);
  return [...tags];
}

const LANG = { en: 'English', ja: 'Japanese', ko: 'Korean', fr: 'French', es: 'Spanish',
  de: 'German', it: 'Italian', hi: 'Hindi', zh: 'Chinese', ru: 'Russian', sv: 'Swedish' };

function tagLabel(medium, tag) {
  const [kind, ...rest] = tag.split(':');
  const val = rest.join(':');
  if (kind === 'genre') return genreNames[medium][val] || 'that genre';
  if (kind === 'lang') return LANG[val] || val.toUpperCase();
  return val;
}

// "Because you like Sci-Fi & Christopher Nolan" — the two best-matching liked tags.
function buildReason(medium, tags, scores) {
  const top = tags.map((t) => [t, scores[t] || 0]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return top.length ? 'Because you like ' + top.map(([t]) => tagLabel(medium, t)).join(' & ') : null;
}

// first YouTube trailer, else first YouTube teaser
function trailerKey(d) {
  const yt = (d.videos?.results || []).filter((v) => v.site === 'YouTube');
  return (yt.find((v) => v.type === 'Trailer') || yt.find((v) => v.type === 'Teaser'))?.key || null;
}

// `scores` = the user's tag -> score map (used only for the "because you like" line)
function toCard(medium, d, scores = {}) {
  const n = normalize(medium, d);
  return {
    id: d.id,
    title: n.title,
    year: n.year,
    rating: Number((d.vote_average || 0).toFixed(1)),
    runtime: n.runtime,
    genres: (d.genres || []).map((g) => g.name),
    overview: d.overview || '',
    poster: d.poster_path ? `${IMG}/w500${d.poster_path}` : '',
    backdrop: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : null,
    trailerKey: trailerKey(d),
    reason: buildReason(medium, buildTags(medium, d), scores),
    isWildcard: false,
  };
}

function toDetail(medium, d, scores) {
  const n = normalize(medium, d);
  return {
    ...toCard(medium, d, scores),
    tagline: d.tagline || null,
    director: n.creator, // the show's creator for TV, the director for movies
    cast: (d.credits?.cast || []).slice(0, 6).map((c) => ({
      name: c.name,
      character: c.character || null,
      photo: c.profile_path ? `${IMG}/w185${c.profile_path}` : null,
    })),
    releaseDate: n.dateStr,
  };
}

module.exports = { tmdb, listPage, getDetails, loadGenres, genreNames, buildTags, tagLabel, toCard, toDetail };
