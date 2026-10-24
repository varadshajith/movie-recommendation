// script.js - the browser code (the "front end")

// Not logged in? Go to the login page
const token = localStorage.getItem('token');
if (!token) location.replace('login.html');

// Grab the page elements we need
const form = document.getElementById('search-form');
const queryInput = document.getElementById('query');
const message = document.getElementById('message');
const resultsSection = document.getElementById('results-section');
const resultsDiv = document.getElementById('results');
const trendingDiv = document.getElementById('trending');
const watchlistDiv = document.getElementById('watchlist');
const panel = document.getElementById('panel');
const overlay = document.getElementById('overlay');

// Saved movies, trending movies and search results are kept here
let watchlist = [];
let trending = [];
let results = [];

// Call our API with the login token; a 401 means the login is no longer valid
async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + token } });
  if (res.status === 401) { logout(); throw new Error('Not logged in'); }
  return res;
}

// Forget the token on the server and in the browser, then go to the login page
async function logout() {
  await fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  location.replace('login.html');
}

// Search for movies; shows a message if the text is too short
async function search(q) {
  if (q.length < 2) {
    message.textContent = 'Please type at least 2 characters.'; // validation message
    return;
  }
  message.textContent = '';
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(q));
    if (!res.ok) throw new Error('bad response');
    results = await res.json();
  } catch (e) {
    message.textContent = 'Search failed.';
    return;
  }
  if (results.length === 0) message.textContent = 'No movies found.';
  document.getElementById('results-title').textContent = 'Results for “' + q + '”';
  resultsSection.hidden = false; // show the results section
  renderCards(resultsDiv, results);
}

// Ask the server for this week's trending movies
async function loadTrending() {
  try {
    const res = await fetch('/api/trending');
    if (!res.ok) throw new Error('bad response');
    trending = await res.json();
    renderCards(trendingDiv, trending);
  } catch (e) {
    trendingDiv.textContent = 'Could not load trending movies.';
  }
}

// Make one movie card (used for trending and for search results)
function makeCard(movie) {
  const card = document.createElement('div');
  card.className = 'card';

  // Poster image, or a grey box when there is no poster
  const poster = document.createElement(movie.poster ? 'img' : 'div');
  if (movie.poster) { poster.src = movie.poster; poster.alt = movie.title; }
  else poster.className = 'no-poster';
  card.appendChild(poster);

  if (movie.rating) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = '⭐ ' + movie.rating; // textContent is safe
    card.appendChild(badge);
  }

  const title = document.createElement('p');
  title.textContent = movie.title;
  const year = document.createElement('p');
  year.className = 'year';
  year.textContent = movie.year;

  const btn = document.createElement('button');
  const isSaved = watchlist.some(w => w.id === movie.id); // already in the watchlist?
  btn.textContent = isSaved ? '✓ Added' : '+ Add';
  btn.disabled = isSaved;
  btn.addEventListener('click', () => addToWatchlist(movie));

  card.append(title, year, btn);
  return card;
}

// Fill one grid with a card for each movie
function renderCards(container, movies) {
  container.textContent = ''; // clear old cards
  movies.forEach(m => container.appendChild(makeCard(m)));
}

// Send a movie to the server to be saved; show a message if it fails
async function addToWatchlist(movie) {
  try {
    const res = await api('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movie),
    });
    if (!res.ok) throw new Error('bad response');
    message.textContent = '';
    loadWatchlist(); // updates the count and turns the button into "Added"
  } catch (e) {
    message.textContent = 'Could not add the movie.';
  }
}

// Delete a movie on the server, then refresh everything
async function removeFromWatchlist(id) {
  await api('/api/watchlist/' + id, { method: 'DELETE' });
  loadWatchlist();
}

// Ask the server for the saved movies, then redraw the panel and the cards
async function loadWatchlist() {
  const res = await api('/api/watchlist');
  watchlist = await res.json();
  document.getElementById('count').textContent = watchlist.length;
  document.getElementById('empty').hidden = watchlist.length > 0;
  watchlistDiv.textContent = '';
  watchlist.forEach(m => watchlistDiv.appendChild(makeItem(m)));
  renderCards(trendingDiv, trending); // so the buttons show "Added"
  renderCards(resultsDiv, results);
}

// Make one row for the side panel: small poster, title, year, Remove button
function makeItem(movie) {
  const item = document.createElement('div');
  item.className = 'item';
  if (movie.poster) {
    const img = document.createElement('img');
    img.src = movie.poster;
    item.appendChild(img);
  }
  const text = document.createElement('div');
  text.textContent = movie.title + ' (' + movie.year + ')';
  const btn = document.createElement('button');
  btn.textContent = 'Remove';
  btn.addEventListener('click', () => removeFromWatchlist(movie.id));
  item.append(text, btn);
  return item;
}

// Open or close the side panel by toggling the class "open"
function togglePanel() {
  panel.classList.toggle('open');
  overlay.classList.toggle('open');
}

// When the form is submitted, search instead of reloading the page
form.addEventListener('submit', event => {
  event.preventDefault();
  search(queryInput.value.trim());
});
document.getElementById('watchlist-btn').addEventListener('click', togglePanel);
document.getElementById('close-btn').addEventListener('click', togglePanel);
overlay.addEventListener('click', togglePanel);
document.getElementById('logout-btn').addEventListener('click', logout);

// Show who is logged in
document.getElementById('user').textContent = localStorage.getItem('username') || '';

// When the page opens, load the trending movies and the saved watchlist
loadTrending();
loadWatchlist();
