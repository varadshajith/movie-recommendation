# Reel - cheat sheet

## Run it
1. Put your TMDB key in a file called `.env`:  `TMDB_KEY=your_key_here`
2. `npm install`
3. `npm start`
4. Open http://localhost:8181

## What each file does
| File | Job |
|------|-----|
| `public/index.html` | The page structure (header, search form, results, watchlist, footer) |
| `public/style.css` | Looks: colours (CSS variables), flexbox header, grid of cards, mobile rule |
| `public/script.js` | Browser logic: validate the search, fetch from the server, build cards with DOM |
| `server.js` | Express server: serves the page and 4 API routes (search, list, add, delete) |
| `db.js` | SQLite database: save / list / delete watchlist movies |
| `package.json` | Project info and the `npm start` command |

## Teacher asks -> change this
| Teacher asks | File : line |
|--------------|-------------|
| Change the page (tab) title | `public/index.html:6` |
| Change the heading text "Reel" | `public/index.html:11` |
| Change the Search button text | `public/index.html:15` |
| Change the search box hint text | `public/index.html:14` |
| Change a section heading | `public/index.html:24` and `public/index.html:29` |
| Change the main (red) colour | `public/style.css:3` |
| Change the background colour | `public/style.css:4` |
| Change the card colour | `public/style.css:5` |
| Change the card size | `public/style.css:51` (the `160px`) |
| Change number of grid columns on mobile | `public/style.css:68` (the `2`) |
| Change the mobile breakpoint | `public/style.css:66` (the `600px`) |
| Change the button hover effect | `public/style.css:41` |
| Change the validation message | `public/script.js:13` |
| Change the minimum search length | `public/script.js:12` (the `2`) |
| Change the Add / Remove button text | `public/script.js:46` / `public/script.js:77` |
| Change the port | `server.js:9` (then open the new port in the browser) |
| Change the API (TMDB) URL | `server.js:21` |

## Which practical each file shows
| Practical | Where |
|-----------|-------|
| 1-2 HTML: headings, lists, image, semantic tags | `public/index.html` |
| 3 CSS (external file) | `public/style.css` |
| 4 Responsive: flexbox, grid, media query | `public/style.css` (`display: flex`, `display: grid`, `@media`) |
| 5 CSS properties | `public/style.css` |
| 6 Linked JS file, events, array functions (`map`, `forEach`) | `public/script.js` |
| 7 Form validation | `public/script.js` (`search` function) |
| 10 Fetch API + JSON | `public/script.js` (`fetch` calls) |
| 11 DOM manipulation + events | `public/script.js` (`createElement`, `addEventListener`) |
| 14 Node + Express server, routing, static files (`public/`) | `server.js` |
| 15 REST API + database | `server.js` routes + `db.js` |

React (practicals 8-9) and PHP (12-13) are on the `main` branch, not here.
