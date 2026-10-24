// db.js - talks to the SQLite database (a single file: data/reel.db)
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Open (or create) the database file inside the data/ folder
const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'reel.db'));

// Make the tables the first time we run
// users: one row per account. sessions: who is logged in. watchlist: each user's saved movies.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS watchlist (
    user_id INTEGER NOT NULL REFERENCES users(id),
    id INTEGER NOT NULL,
    title TEXT,
    year TEXT,
    poster TEXT,
    PRIMARY KEY (user_id, id)
  );
`);

// ---------- Users and sessions ----------

// Save a new user; throws if the username is already taken (UNIQUE)
function createUser(username, passHash) {
  const result = db.prepare('INSERT INTO users (username, pass_hash) VALUES (?, ?)').run(username, passHash);
  return Number(result.lastInsertRowid);
}

// Find a user by username (undefined if there is none)
function findUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function createSession(token, userId) {
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
}

// Which user does this login token belong to?
function userForToken(token) {
  return db.prepare('SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ?').get(token);
}

function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ---------- Watchlist (always for one user) ----------

// Get every movie in this user's watchlist
function getAll(userId) {
  return db.prepare('SELECT id, title, year, poster FROM watchlist WHERE user_id = ?').all(userId);
}

// Add a movie; INSERT OR IGNORE skips it if this user already saved it
function add(userId, m) {
  db.prepare('INSERT OR IGNORE INTO watchlist (user_id, id, title, year, poster) VALUES (?, ?, ?, ?, ?)')
    .run(userId, m.id, m.title, m.year || '', m.poster || null);
}

// Delete one movie from this user's watchlist
function remove(userId, id) {
  db.prepare('DELETE FROM watchlist WHERE user_id = ? AND id = ?').run(userId, id);
}

module.exports = { createUser, findUser, createSession, userForToken, deleteSession, getAll, add, remove };
