// server.js - the Express web server (the "back end")
const express = require('express');
const db = require('./db');

// Load TMDB_KEY from the .env file (ignore if the file is missing)
try { process.loadEnvFile('.env'); } catch (e) { console.log('No .env file found'); }

const app = express();
const PORT = 8181;

app.use(express.json()); // lets us read JSON sent in POST bodies

// Send index.html, style.css and script.js to the browser (dotfiles like .env are blocked)
app.use(express.static(__dirname, { dotfiles: 'deny' }));

// GET /api/search?q=batman - ask TMDB for movies and send back a short list
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Query is required' });
  try {
    const url = 'https://api.themoviedb.org/3/search/movie?api_key=' +
      process.env.TMDB_KEY + '&query=' + encodeURIComponent(q);
    const data = await (await fetch(url)).json();
    // Keep only the fields the page needs
    const movies = (data.results || []).map(m => ({
      id: m.id,
      title: m.title,
      year: (m.release_date || '').slice(0, 4),
      poster: m.poster_path ? 'https://image.tmdb.org/t/p/w200' + m.poster_path : null,
    }));
    res.json(movies);
  } catch (e) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/watchlist - send every saved movie
app.get('/api/watchlist', (req, res) => {
  try { res.json(db.getAll()); }
  catch (e) { res.status(500).json({ error: 'Could not load watchlist' }); }
});

// POST /api/watchlist - save a movie sent as JSON
app.post('/api/watchlist', (req, res) => {
  const m = req.body;
  if (!Number.isInteger(m.id) || typeof m.title !== 'string') {
    return res.status(400).json({ error: 'Need integer id and string title' });
  }
  try { db.add(m); res.status(201).json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Could not save movie' }); }
});

// DELETE /api/watchlist/:id - remove a saved movie
app.delete('/api/watchlist/:id', (req, res) => {
  try { db.remove(Number(req.params.id)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Could not delete movie' }); }
});

// Start listening
app.listen(PORT, () => console.log('Reel running at http://localhost:' + PORT));
