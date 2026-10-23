// db.js - talks to the SQLite database (a single file called reel.db)
const { DatabaseSync } = require('node:sqlite');

// Open (or create) the database file
const db = new DatabaseSync('reel.db');

// Make the watchlist table the first time we run
db.exec('CREATE TABLE IF NOT EXISTS watchlist (id INTEGER PRIMARY KEY, title TEXT, year TEXT, poster TEXT)');

// Get every movie in the watchlist
function getAll() {
  return db.prepare('SELECT * FROM watchlist').all();
}

// Add a movie; INSERT OR IGNORE skips it if the id already exists
function add(m) {
  db.prepare('INSERT OR IGNORE INTO watchlist (id, title, year, poster) VALUES (?, ?, ?, ?)')
    .run(m.id, m.title, m.year || '', m.poster || null);
}

// Delete one movie by its id
function remove(id) {
  db.prepare('DELETE FROM watchlist WHERE id = ?').run(id);
}

module.exports = { getAll, add, remove };
