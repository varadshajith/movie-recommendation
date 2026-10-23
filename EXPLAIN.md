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

## Likely viva questions

**HTML / CSS**
- **What is semantic HTML?** Tags that say what the content *is*, not how it looks: `header`, `main`, `section`, `footer`. It helps screen readers and search engines. Used in `public/index.html`.
- **Inline vs internal vs external CSS?** Inline = `style="..."` on one tag. Internal = a `<style>` block inside the HTML file. External = a separate `.css` file linked with `<link>`. This project uses external (`public/style.css`), because one file styles the whole site.
- **What are CSS variables?** Values like `--main: red;` defined once in `:root` and used with `var(--main)`. Change one line and the whole site changes colour.
- **Flexbox vs Grid?** Flexbox lays things out in one direction (a row or a column), e.g. the header and search form. Grid lays things out in two dimensions (rows and columns), e.g. the movie cards.
- **What does a media query do?** It applies CSS only when a condition is true, e.g. `@media (max-width: 600px)` changes the layout on phones.
- **CSS position values?** `static` (default), `relative` (moved from its normal place), `absolute` (placed relative to the nearest positioned parent), `fixed` (stuck to the screen), `sticky` (scrolls normally until it hits a point, then sticks).

**JavaScript**
- **How is the JS file linked?** `<script src="script.js"></script>` at the bottom of `index.html`, so the HTML is loaded before the script runs.
- **What is the DOM?** The browser's tree of objects built from the HTML. JS changes the page through it: `document.createElement`, `appendChild`, `textContent`.
- **What does `addEventListener` do?** It runs a function when something happens, e.g. a form `submit` or a button `click`.
- **What is form validation?** Checking the input before using it. Here an empty or too-short search shows a message and doesn't call the server.
- **Why `event.preventDefault()`?** A form submit normally reloads the page. This stops the reload so JS can handle the submit instead.
- **What do `map` / `filter` / `forEach` do?** `map` makes a new array by changing each item. `filter` keeps only the items that pass a test. `forEach` just runs code for each item.
- **What does `fetch` return?** A Promise for the server's response. `await res.json()` turns the response body into a JS object.
- **What is JSON?** A text format for data, like `{"id": 1, "title": "Batman"}`. The server and the browser talk to each other in JSON.
- **What are `async` / `await`?** A way to wait for slow things (network, database) without freezing the page.
- **Why `textContent` and not `innerHTML`?** `textContent` treats data as plain text, so a movie title containing `<script>` can't run as code (XSS protection).

**Node / Express / Database**
- **What is Node.js?** JavaScript running on the server instead of in the browser.
- **What is Express?** A small Node library for building web servers: routes, middleware and static files.
- **What is a route?** A method + URL pair mapped to a function, e.g. `app.get('/api/watchlist', ...)`.
- **What is REST?** A style of API where URLs are things and HTTP methods are actions. GET = read, POST = create, PUT = update, DELETE = remove.
- **What is middleware?** A function that runs on every request before the route. `express.json()` reads JSON bodies. `express.static('public')` sends the files in `public/`.
- **Why only serve `public/`?** So `.env` (the API key), `reel.db` and the server code can't be downloaded from the browser.
- **Why does the TMDB API key stay on the server?** Anything sent to the browser can be seen by anyone. The browser asks our server, and our server asks TMDB with the key.
- **What is SQLite?** A database stored in a single file (`reel.db`), with no separate database server. We use Node's built-in `node:sqlite`.
- **What is SQL injection, and how is it prevented?** An attacker puts SQL code into an input. `?` placeholders in `db.js` send the values separately from the SQL, so they are never run as code.
- **What does `INSERT OR IGNORE` do?** It skips the insert if that movie id already exists, so there are no duplicates.
- **What do these status codes mean?** 200 OK, 201 Created, 400 bad input from the user, 404 not found, 500 server error.
- **What are CRUD operations?** Create, Read, Update, Delete. Here: add (C), view (R), remove (D). There is no update, because editing was removed to keep the app simple.
