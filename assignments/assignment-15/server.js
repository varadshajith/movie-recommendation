// Practical 15: a REST API with Node.js, Express and a database (SQLite).
// A watchlist resource with full CRUD, following the style of reel-backend/server.js.
//
//   GET    /api/watchlist            list (optional ?medium=movie|tv)
//   GET    /api/watchlist/:id        one item
//   POST   /api/watchlist            create   { title, medium, year?, watched?, rating? }
//   PUT    /api/watchlist/:id        replace  (same body as POST)
//   PATCH  /api/watchlist/:id        change some fields
//   DELETE /api/watchlist/:id        delete
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());

// Validates a body; returns { error } or { value } with clean fields.
function validate(body) {
  const title = String(body.title ?? '').trim();
  const medium = body.medium ?? 'movie';
  const year = body.year == null || body.year === '' ? null : Number(body.year);
  const rating = body.rating == null || body.rating === '' ? null : Number(body.rating);
  const watched = Boolean(body.watched);

  if (!title || title.length > 120) return { error: 'title is required (max 120 characters)' };
  if (!['movie', 'tv'].includes(medium)) return { error: "medium must be 'movie' or 'tv'" };
  if (year !== null && !(Number.isInteger(year) && year >= 1888 && year <= 2100)) return { error: 'year must be a valid year' };
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 10)) return { error: 'rating must be 1–10' };
  return { value: { title, medium, year, watched, rating } };
}

// Loads :id or answers 404. Returns the row or null.
function findOr404(req, res) {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) ? db.get(id) : null;
  if (!row) res.status(404).json({ error: 'Not found' });
  return row;
}

app.get('/api/watchlist', (req, res) => {
  const medium = ['movie', 'tv'].includes(req.query.medium) ? req.query.medium : null;
  res.json({ items: db.all(medium) });
});

app.get('/api/watchlist/:id', (req, res) => {
  const row = findOr404(req, res);
  if (row) res.json({ item: row });
});

app.post('/api/watchlist', (req, res) => {
  const { error, value } = validate(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.status(201).json({ item: db.create(value) });
});

app.put('/api/watchlist/:id', (req, res) => {
  const row = findOr404(req, res);
  if (!row) return;
  const { error, value } = validate(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.json({ item: db.update(row.id, value) });
});

app.patch('/api/watchlist/:id', (req, res) => {
  const row = findOr404(req, res);
  if (!row) return;
  const { error, value } = validate({ ...row, ...req.body });   // merge new fields over the stored row
  if (error) return res.status(400).json({ error });
  res.json({ item: db.update(row.id, value) });
});

app.delete('/api/watchlist/:id', (req, res) => {
  const row = findOr404(req, res);
  if (!row) return;
  db.remove(row.id);
  res.status(204).end();
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));

// bad JSON body / any other error -> JSON instead of an HTML stack trace
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Watchlist API at http://localhost:${PORT}/api/watchlist`));
}

module.exports = app;
