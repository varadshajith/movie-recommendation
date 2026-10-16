// Database layer: SQLite via Node's built-in `node:sqlite` (no native module to compile).
// Every taste table is keyed by (user_id, medium) so each user keeps separate
// Movies and TV profiles.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'app.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, pass_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings(user_id INT, key TEXT, value TEXT, PRIMARY KEY(user_id, key));
  CREATE TABLE IF NOT EXISTS profile_tags(user_id INT, medium TEXT, tag TEXT, score REAL, PRIMARY KEY(user_id, medium, tag));
  CREATE TABLE IF NOT EXISTS actions(id INTEGER PRIMARY KEY, user_id INT, medium TEXT, movie_id INT, action TEXT, weight REAL, ts INT);
  CREATE TABLE IF NOT EXISTS hidden(user_id INT, medium TEXT, movie_id INT, until_ts INT, PRIMARY KEY(user_id, medium, movie_id));
  CREATE TABLE IF NOT EXISTS lists(user_id INT, medium TEXT, movie_id INT, list TEXT, ts INT, PRIMARY KEY(user_id, medium, movie_id, list));
  CREATE TABLE IF NOT EXISTS movie_cache(medium TEXT, id INT, json TEXT, PRIMARY KEY(medium, id));
`);

const run = (sql, ...p) => db.prepare(sql).run(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

// ---- users + login sessions ----
const createUser = (username, passHash) =>
  Number(run('INSERT INTO users(username, pass_hash) VALUES(?, ?)', username, passHash).lastInsertRowid);
const findUser = (username) => get('SELECT * FROM users WHERE username = ?', username);
const createSession = (token, userId) => run('INSERT INTO sessions(token, user_id) VALUES(?, ?)', token, userId);
const deleteSession = (token) => run('DELETE FROM sessions WHERE token = ?', token);
const userForToken = (token) =>
  get('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', token);

// ---- settings ----
const getSetting = (uid, key) => get('SELECT value FROM settings WHERE user_id = ? AND key = ?', uid, key)?.value ?? null;
const setSetting = (uid, key, value) =>
  run(`INSERT INTO settings VALUES(?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`, uid, key, String(value));

// ---- taste profile: tag -> score ----
const bumpTag = (uid, medium, tag, delta) =>
  run(`INSERT INTO profile_tags VALUES(?, ?, ?, ?)
       ON CONFLICT(user_id, medium, tag) DO UPDATE SET score = score + excluded.score`, uid, medium, tag, delta);
const getProfileTags = (uid, medium) =>
  Object.fromEntries(all('SELECT tag, score FROM profile_tags WHERE user_id = ? AND medium = ?', uid, medium).map((r) => [r.tag, r.score]));
const hasProfile = (uid, medium) => !!get('SELECT 1 AS x FROM profile_tags WHERE user_id = ? AND medium = ? LIMIT 1', uid, medium);

// ---- swipe history ----
const logAction = (uid, medium, movieId, action, weight, ts) =>
  run('INSERT INTO actions(user_id, medium, movie_id, action, weight, ts) VALUES(?, ?, ?, ?, ?, ?)', uid, medium, movieId, action, weight, ts);
const swipeCount = (uid, medium) => get('SELECT COUNT(*) AS n FROM actions WHERE user_id = ? AND medium = ?', uid, medium).n;

// untilTs = null -> hidden forever; a future ms timestamp -> comes back after it passes
const hide = (uid, medium, movieId, untilTs) =>
  run(`INSERT INTO hidden VALUES(?, ?, ?, ?) ON CONFLICT(user_id, medium, movie_id) DO UPDATE SET until_ts = excluded.until_ts`,
    uid, medium, movieId, untilTs);
const hiddenIds = (uid, medium, now) =>
  all('SELECT movie_id FROM hidden WHERE user_id = ? AND medium = ? AND (until_ts IS NULL OR until_ts > ?)', uid, medium, now)
    .map((r) => r.movie_id);

// ---- watchlist / seen-and-loved shelves ----
const addToList = (uid, medium, movieId, list, ts) =>
  run('INSERT OR IGNORE INTO lists VALUES(?, ?, ?, ?, ?)', uid, medium, movieId, list, ts);
const getList = (uid, medium, list) =>
  all('SELECT movie_id FROM lists WHERE user_id = ? AND medium = ? AND list = ? ORDER BY ts DESC', uid, medium, list).map((r) => r.movie_id);
const listCount = (uid, medium, list) =>
  get('SELECT COUNT(*) AS n FROM lists WHERE user_id = ? AND medium = ? AND list = ?', uid, medium, list).n;

// ---- TMDB response cache (shared by all users) ----
const getCachedMovie = (medium, id) => {
  const row = get('SELECT json FROM movie_cache WHERE medium = ? AND id = ?', medium, id);
  return row ? JSON.parse(row.json) : null;
};
const putCachedMovie = (medium, id, obj) =>
  run('INSERT OR REPLACE INTO movie_cache VALUES(?, ?, ?)', medium, id, JSON.stringify(obj));

// wipe one user's taste data (account + shared cache stay)
const resetUser = (uid) => {
  for (const t of ['settings', 'profile_tags', 'actions', 'hidden', 'lists']) run(`DELETE FROM ${t} WHERE user_id = ?`, uid);
};

module.exports = {
  createUser, findUser, createSession, deleteSession, userForToken,
  getSetting, setSetting, bumpTag, getProfileTags, hasProfile,
  logAction, swipeCount, hide, hiddenIds,
  addToList, getList, listCount, getCachedMovie, putCachedMovie, resetUser,
};
