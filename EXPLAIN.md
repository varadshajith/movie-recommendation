# Reel - cheat sheet

## Run it
1. Put your TMDB key in a file called `.env`:  `TMDB_KEY=your_key_here`
2. `npm install`
3. `npm start`
4. Open http://localhost:8181

## What each file does
| File | Job |
|------|-----|
| `index.html` | The page structure (header, search form, results, watchlist, footer) |
| `style.css` | Looks: colours (CSS variables), flexbox header, grid of cards, mobile rule |
| `script.js` | Browser logic: validate the search, fetch from the server, build cards with DOM |
| `server.js` | Express server: serves the page and 4 API routes (search, list, add, delete) |
| `db.js` | SQLite database: save / list / delete watchlist movies |
| `package.json` | Project info and the `npm start` command |

## Teacher asks -> change this
| Teacher asks | File : line |
|--------------|-------------|
| Change the page (tab) title | `index.html:6` |
| Change the heading text "Reel" | `index.html:11` |
| Change the Search button text | `index.html:15` |
| Change the search box hint text | `index.html:14` |
| Change a section heading | `index.html:24` and `index.html:29` |
| Change the main (red) colour | `style.css:3` |
| Change the background colour | `style.css:4` |
| Change the card colour | `style.css:5` |
| Change the card size | `style.css:51` (the `160px`) |
| Change number of grid columns on mobile | `style.css:68` (the `2`) |
| Change the mobile breakpoint | `style.css:66` (the `600px`) |
| Change the button hover effect | `style.css:41` |
| Change the validation message | `script.js:13` |
| Change the minimum search length | `script.js:12` (the `2`) |
| Change the Add / Remove button text | `script.js:46` / `script.js:77` |
| Change the port | `server.js:9` (then open the new port in the browser) |
| Change the API (TMDB) URL | `server.js:21` |

## Which practical each file shows
| Practical | Where |
|-----------|-------|
| 1-2 HTML structure, semantic tags, forms | `index.html` |
| 3-5 CSS: selectors, variables, flexbox, grid, hover | `style.css` |
| 6 Media query (responsive) | `style.css:66` |
| 7 JavaScript basics, functions, arrays (`map`, `forEach`) | `script.js` |
| 10 DOM + events + form validation | `script.js` (`search`, `makeCard`, `addEventListener`) |
| 11 fetch / AJAX / JSON | `script.js` (`fetch` calls) |
| 14 Node + Express server and routes | `server.js` |
| 15 Database (SQLite) | `db.js` |

React (practicals 8-9) and PHP (12-13) are on the `main` branch, not here.
