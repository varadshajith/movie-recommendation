// Database layer: SQLite via Node's built-in `node:sqlite` (same as reel-backend/db.js).
// All queries use ? placeholders, so user input can never change the SQL.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, 'watchlist.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist(
    id      INTEGER PRIMARY KEY,
    title   TEXT NOT NULL,
    medium  TEXT NOT NULL CHECK(medium IN ('movie','tv')),
    year    INT,
    watched INT NOT NULL DEFAULT 0,
    rating  INT CHECK(rating BETWEEN 1 AND 10),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const all = (medium) =>
  medium
    ? db.prepare('SELECT * FROM watchlist WHERE medium = ? ORDER BY id DESC').all(medium)
    : db.prepare('SELECT * FROM watchlist ORDER BY id DESC').all();

const get = (id) => db.prepare('SELECT * FROM watchlist WHERE id = ?').get(id);

const create = ({ title, medium, year, watched, rating }) => {
  const r = db.prepare('INSERT INTO watchlist(title, medium, year, watched, rating) VALUES(?, ?, ?, ?, ?)')
    .run(title, medium, year, watched ? 1 : 0, rating);
  return get(Number(r.lastInsertRowid));
};

const update = (id, { title, medium, year, watched, rating }) => {
  db.prepare('UPDATE watchlist SET title = ?, medium = ?, year = ?, watched = ?, rating = ? WHERE id = ?')
    .run(title, medium, year, watched ? 1 : 0, rating, id);
  return get(id);
};

const remove = (id) => db.prepare('DELETE FROM watchlist WHERE id = ?').run(id).changes > 0;

module.exports = { all, get, create, update, remove };
