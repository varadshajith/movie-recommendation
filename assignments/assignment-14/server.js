// Practical 14: Node.js + Express web server with routing and static files.
// Same setup as reel-backend/server.js: express.static serves the frontend,
// routes answer the rest.
const path = require('path');
const express = require('express');

const PORT = process.env.PORT || 3000;
const app = express();

// ---------- middleware ----------
// tiny request logger
app.use((req, _res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});
app.use(express.urlencoded({ extended: false })); // read HTML form posts

// ---------- static resources: public/index.html, public/style.css, ... ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- routes ----------
const MOVIES = [
  { id: 1, title: 'Inception', year: 2010, genre: 'Sci-Fi' },
  { id: 2, title: 'Parasite', year: 2019, genre: 'Thriller' },
  { id: 3, title: 'Spirited Away', year: 2001, genre: 'Animation' },
];

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="/style.css"></head><body><main class="wrap">${body}
<p><a href="/">← Home</a></p></main></body></html>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

app.get('/about', (_req, res) => {
  res.send(page('About', '<h1>About Reel</h1><p>A movie recommender built with Node.js and Express.</p>'));
});

// route parameter
app.get('/movies/:id', (req, res) => {
  const movie = MOVIES.find((m) => m.id === Number(req.params.id));
  if (!movie) return res.status(404).send(page('Not found', '<h1>Movie not found</h1>'));
  res.send(page(movie.title, `<h1>${esc(movie.title)}</h1><p>${movie.year} · ${esc(movie.genre)}</p>`));
});

// query string: /movies?genre=Sci-Fi
app.get('/movies', (req, res) => {
  const genre = req.query.genre;
  const list = genre ? MOVIES.filter((m) => m.genre.toLowerCase() === String(genre).toLowerCase()) : MOVIES;
  const items = list.map((m) => `<li><a href="/movies/${m.id}">${esc(m.title)}</a> (${m.year})</li>`).join('');
  res.send(page('Movies', `<h1>Movies${genre ? ' — ' + esc(genre) : ''}</h1><ul>${items || '<li>None</li>'}</ul>`));
});

// JSON route
app.get('/api/movies', (_req, res) => res.json(MOVIES));

// POST route (form in public/index.html)
app.post('/contact', (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) return res.status(400).send(page('Error', '<h1>Please enter your name.</h1>'));
  res.send(page('Thanks', `<h1>Thanks, ${esc(name)}!</h1><p>We got your message.</p>`));
});

// grouped routes with express.Router: /admin/...
const admin = express.Router();
admin.get('/', (_req, res) => res.send(page('Admin', '<h1>Admin home</h1>')));
admin.get('/stats', (_req, res) => res.json({ movies: MOVIES.length, uptimeSeconds: Math.round(process.uptime()) }));
app.use('/admin', admin);

// 404 for everything else
app.use((_req, res) => res.status(404).send(page('404', '<h1>404 — page not found</h1>')));

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
