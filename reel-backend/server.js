// Reel backend: an Express REST API (+ it also serves the frontend files).
//   public:    POST /api/register, POST /api/login            (auth.js)
//   protected: everything else under /api needs a login token
const path = require('path');
const express = require('express');
const cors = require('cors');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env: TMDB_KEY check below explains */ }

const db = require('./db');
const tm = require('./tmdb');
const { router: authRouter, requireLogin } = require('./auth');
const { nextCards } = require('./recommend');

const PORT = process.env.PORT || 8181;
const MEH_RETURNS_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // "meh" titles come back after 30 days

// How much each swipe changes the taste profile.
const WEIGHTS = { nope: -2, like: 2, meh: -0.5, save: 4, seenLoved: 5, seenDisliked: -4 };

const asMedium = (m) => (m === 'tv' ? 'tv' : 'movie');

// Express 4 does not catch errors thrown in async handlers — this wrapper does.
const route = (handler) => (req, res) =>
  Promise.resolve(handler(req, res)).catch((err) => {
    console.error(`${req.method} ${req.path}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  });

// Who is asking, and for which medium (Movies / TV).
const who = (req) => ({ uid: req.user.id, medium: asMedium(req.query.medium ?? req.body?.medium) });

// Cards for one of the user's shelves ('watchlist' | 'seenLoved').
async function shelf(uid, medium, list, scores) {
  const cards = await Promise.all(db.getList(uid, medium, list).map(async (id) => {
    try { return tm.toCard(medium, await tm.getDetails(medium, id), scores); } catch { return null; }
  }));
  return cards.filter(Boolean);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'reel-frontend'))); // serve index.html, login.html, ...

app.use('/api', authRouter);  // /api/register, /api/login, /api/logout
app.use('/api', requireLogin); // everything below needs a valid token

app.get('/api/genres', (req, res) => {
  const { medium } = who(req);
  res.json({ genres: Object.entries(tm.genreNames[medium]).map(([id, name]) => ({ id: Number(id), name })) });
});

// Typeahead used by onboarding. Search hits already carry title + poster, so no detail calls.
app.get('/api/search', route(async (req, res) => {
  const { medium } = who(req);
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.json({ results: [] });
  const hits = await tm.listPage(`/search/${medium}`, { query: q, include_adult: 'false' });
  res.json({ results: hits.slice(0, 12).map((m) => tm.toCard(medium, m)) });
}));

app.get('/api/state', route(async (req, res) => {
  const { uid, medium } = who(req);
  const scores = db.getProfileTags(uid, medium);
  res.json({
    username: req.user.username,
    onboarded: db.hasProfile(uid, medium),
    hintsSeen: db.getSetting(uid, 'hintsSeen') === 'true',
    watchlist: await shelf(uid, medium, 'watchlist', scores),
    seenLoved: await shelf(uid, medium, 'seenLoved', scores),
  });
}));

app.get('/api/movie/:id', route(async (req, res) => {
  const { uid, medium } = who(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id' });
  const d = await tm.getDetails(medium, id);
  res.json({ movie: tm.toDetail(medium, d, db.getProfileTags(uid, medium)) });
}));

// First-time setup: liked genres + 3–5 loved titles seed the taste profile.
app.post('/api/onboard', route(async (req, res) => {
  const { uid, medium } = who(req);
  const toIds = (v) => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : []);
  const now = Date.now();

  for (const g of toIds(req.body.genreIds)) db.bumpTag(uid, medium, `genre:${g}`, 2);
  for (const id of toIds(req.body.lovedIds)) {
    try {
      for (const tag of tm.buildTags(medium, await tm.getDetails(medium, id))) db.bumpTag(uid, medium, tag, 4);
    } catch { /* title failed to load: still record it as loved below */ }
    db.hide(uid, medium, id, null);                  // already seen -> never show again
    db.addToList(uid, medium, id, 'seenLoved', now);
  }
  res.json({ ok: true });
}));

// Every swipe/button press ends up here.
app.post('/api/action', route(async (req, res) => {
  const { uid, medium } = who(req);
  const movieId = Number(req.body.movieId);
  const action = String(req.body.action ?? '');
  if (!Number.isInteger(movieId) || !(action in WEIGHTS)) return res.status(400).json({ error: 'Bad movieId or action' });
  const now = Date.now();

  let tags = [];
  try { tags = tm.buildTags(medium, await tm.getDetails(medium, movieId)); } catch { /* still log the swipe */ }
  for (const tag of tags) db.bumpTag(uid, medium, tag, WEIGHTS[action]);
  db.logAction(uid, medium, movieId, action, WEIGHTS[action], now);
  db.hide(uid, medium, movieId, action === 'meh' ? now + MEH_RETURNS_AFTER_MS : null);
  if (action === 'save') db.addToList(uid, medium, movieId, 'watchlist', now);
  if (action === 'seenLoved') db.addToList(uid, medium, movieId, 'seenLoved', now);

  res.json({ ok: true, watchlistCount: db.listCount(uid, medium, 'watchlist') });
}));

app.post('/api/next', route(async (req, res) => {
  const { uid, medium } = who(req);
  const count = Math.min(Number(req.body.count) || 10, 20);
  const inQueue = Array.isArray(req.body.inQueue) ? req.body.inQueue.map(Number) : [];
  res.json({ cards: await nextCards(uid, medium, count, inQueue) });
}));

app.post('/api/settings', (req, res) => {
  if (typeof req.body.hintsSeen === 'boolean') db.setSetting(req.user.id, 'hintsSeen', req.body.hintsSeen);
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  db.resetUser(req.user.id);
  res.json({ ok: true });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));

if (!process.env.TMDB_KEY) {
  console.error('Missing TMDB_KEY. Put it in reel-backend/.env (free key: https://www.themoviedb.org/settings/api)');
  process.exit(1);
}
tm.loadGenres()
  .then(() => app.listen(PORT, () => console.log(`Reel running at http://localhost:${PORT}`)))
  .catch((err) => { console.error('Cannot reach TMDB (check TMDB_KEY / internet):', err.message); process.exit(1); });
