# Assignments: Web Technology Practicals

Each folder covers one practical. The code comes from the **Reel** movie
recommender project in this repo (`reel-frontend`, `reel-backend`, `reel-php`),
cut down so every assignment runs on its own.

| # | Practical | Files | How to run |
|---|-----------|-------|------------|
| 1 | Basic webpage: headings, lists, images | `index.html`, 2 screenshots | Open `index.html` in a browser |
| 2 | Semantic HTML tags (`header`, `nav`, `main`, `section`, `article`, `aside`, `figure`, `footer`, ...) | `index.html` | Open in browser |
| 3 | CSS: inline, internal, external | `index.html`, `style.css` | Open in browser |
| 4 | Responsive page: Flexbox, CSS Grid, media queries | `index.html`, `style.css` | Open, then resize the window (800px / 520px breakpoints) |
| 5 | CSS positions (static, relative, absolute, fixed, sticky), z-index, transform | `index.html`, `style.css` | Open, then scroll |
| 6 | Linked JS file, events, array functions (`map`, `filter`, `reduce`, `some`, `every`, `find`, `sort`, `flatMap`) | `index.html`, `script.js`, `style.css` | Open, then click Like / Nope |
| 7 | JS front-end features and form validation | `index.html`, `script.js`, `style.css` | Open, then submit the empty form, then fill it in |
| 8 | React SPA with functional components and JSX | `index.html`, `app.jsx`, `style.css` | Serve the folder (see below), then use the Home / Browse / About links |
| 9 | React props, state, hooks (`useState`, `useEffect`, `useRef`, custom hook), events, conditional rendering | `index.html`, `app.jsx`, `style.css` | Serve the folder |
| 10 | Fetch data from an API and show the JSON | `index.html`, `script.js`, `picks.json`, `style.css` | Serve the folder (needs internet for the TVmaze API) |
| 11 | DOM manipulation and event handling (drag to swipe, keyboard, buttons) | `index.html`, `script.js`, `style.css` | Open, then drag the card or press ← → ↑ Enter |
| 12 | PHP: form handling, validation, string functions, sessions | `index.php`, `style.css` | `php -S localhost:8000` in the folder |
| 13 | PHP + MySQL: database connection and CRUD | `db.php`, `login.php`, `index.php`, `logout.php`, `schema.sql`, `diary.css` | `mysql -u root -p < schema.sql`, then `php -S localhost:8000` and open `/login.php` |
| 14 | Node.js + Express: web server, routing, static files | `server.js`, `public/`, `package.json` | `npm install && npm start`, then open http://localhost:3000 |
| 15 | REST API with Node.js, Express and a database (SQLite) | `server.js`, `db.js`, `test.js`, `package.json` | `npm install && npm start` (API on http://localhost:3001/api/watchlist), `npm test` to check every route |

**Serving a folder:** React with Babel and `fetch()` don't work from `file://`.
Run `python3 -m http.server 8000` inside the folder and open http://localhost:8000.

**Requirements:** a modern browser. Node.js 22.13 or newer for 14 and 15
(15 uses the built-in `node:sqlite`). PHP 8 for 12 and 13, plus MySQL for 13.

## Example requests for assignment 15

```bash
curl -X POST localhost:3001/api/watchlist -H 'Content-Type: application/json' \
     -d '{"title":"Inception","medium":"movie","year":2010}'
curl localhost:3001/api/watchlist
curl -X PATCH localhost:3001/api/watchlist/1 -H 'Content-Type: application/json' -d '{"watched":true,"rating":9}'
curl -X DELETE localhost:3001/api/watchlist/1
```
