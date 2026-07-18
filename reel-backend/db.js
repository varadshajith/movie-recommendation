// SQLite-backed persistent memory. Backend owns all state (contract v2).
// Every per-taste table is keyed by `medium` ('movie' | 'tv') so Movies and
// TV keep entirely separate profiles, exclusions, lists and caches.
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'reel.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS profile_tags(medium TEXT, tag TEXT, score REAL NOT NULL, PRIMARY KEY(medium, tag));
  CREATE TABLE IF NOT EXISTS actions(id INTEGER PRIMARY KEY, medium TEXT, movie_id INT, action TEXT, weight REAL, ts INT);
  CREATE TABLE IF NOT EXISTS excluded(medium TEXT, movie_id INT, until_ts INT, PRIMARY KEY(medium, movie_id));
  CREATE TABLE IF NOT EXISTS lists(medium TEXT, movie_id INT, list TEXT, ts INT, PRIMARY KEY(medium, movie_id, list));
  CREATE TABLE IF NOT EXISTS movie_cache(medium TEXT, id INT, json TEXT, fetched_at INT, PRIMARY KEY(medium, id));
`);

// ---- prepared statements ----
const S = {
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare(`INSERT INTO settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
  bumpTag: db.prepare(`INSERT INTO profile_tags(medium, tag, score) VALUES(?, ?, ?)
    ON CONFLICT(medium, tag) DO UPDATE SET score = score + excluded.score`),
  allTags: db.prepare('SELECT tag, score FROM profile_tags WHERE medium = ?'),
  countTags: db.prepare('SELECT COUNT(*) AS n FROM profile_tags WHERE medium = ?'),
  logAction: db.prepare('INSERT INTO actions(medium, movie_id, action, weight, ts) VALUES(?, ?, ?, ?, ?)'),
  countActions: db.prepare('SELECT COUNT(*) AS n FROM actions WHERE medium = ?'),
  // NB: table is named `excluded`, which collides with SQLite's ON CONFLICT
  // `excluded` pseudo-table — so bind new values via named params.
  exclude: db.prepare(`INSERT INTO excluded(medium, movie_id, until_ts) VALUES(@medium, @id, @until)
    ON CONFLICT(medium, movie_id) DO UPDATE SET until_ts = @until`),
  activeExcluded: db.prepare('SELECT movie_id FROM excluded WHERE medium = ? AND (until_ts IS NULL OR until_ts > ?)'),
  addToList: db.prepare('INSERT OR IGNORE INTO lists(medium, movie_id, list, ts) VALUES(?, ?, ?, ?)'),
  getList: db.prepare('SELECT movie_id FROM lists WHERE medium = ? AND list = ? ORDER BY ts DESC'),
  countList: db.prepare('SELECT COUNT(*) AS n FROM lists WHERE medium = ? AND list = ?'),
  getCache: db.prepare('SELECT json FROM movie_cache WHERE medium = ? AND id = ?'),
  putCache: db.prepare(`INSERT INTO movie_cache(medium, id, json, fetched_at) VALUES(?, ?, ?, ?)
    ON CONFLICT(medium, id) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`),
};

const getSetting = (key) => S.getSetting.get(key)?.value ?? null;
const setSetting = (key, value) => S.setSetting.run(key, String(value));

const bumpTag = (medium, tag, delta) => S.bumpTag.run(medium, tag, delta);
// scorecard as { tag: score } — the profile shape the engine already expects
const getProfileTags = (medium) => Object.fromEntries(S.allTags.all(medium).map((r) => [r.tag, r.score]));
const hasProfile = (medium) => S.countTags.get(medium).n > 0;

const logAction = (medium, movieId, action, weight, ts) => S.logAction.run(medium, movieId, action, weight, ts);
const swipeCount = (medium) => S.countActions.get(medium).n;

// untilTs = null -> excluded forever; a future ms timestamp -> resurfaces after it passes
const exclude = (medium, movieId, untilTs) => S.exclude.run({ medium, id: movieId, until: untilTs });
const activeExclusions = (medium, now) => S.activeExcluded.all(medium, now).map((r) => r.movie_id);

const addToList = (medium, movieId, list, ts) => S.addToList.run(medium, movieId, list, ts);
const getList = (medium, list) => S.getList.all(medium, list).map((r) => r.movie_id);
const listCount = (medium, list) => S.countList.get(medium, list).n;

const getCachedMovie = (medium, id) => {
  const row = S.getCache.get(medium, id);
  return row ? JSON.parse(row.json) : null;
};
const putCachedMovie = (medium, id, obj) => S.putCache.run(medium, id, JSON.stringify(obj), Date.now());

// wipe every taste table except movie_cache (cache is just TMDB data, safe to keep).
// No medium arg -> full wipe of both media (used by /api/reset).
const resetAll = db.transaction(() => {
  for (const t of ['settings', 'profile_tags', 'actions', 'excluded', 'lists']) {
    db.exec(`DELETE FROM ${t}`);
  }
});

module.exports = {
  getSetting, setSetting,
  bumpTag, getProfileTags, hasProfile,
  logAction, swipeCount,
  exclude, activeExclusions,
  addToList, getList, listCount,
  getCachedMovie, putCachedMovie,
  resetAll,
};
