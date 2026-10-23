// script.js - the browser code (the "front end")

// Grab the page elements we need
const form = document.getElementById('search-form');
const queryInput = document.getElementById('query');
const message = document.getElementById('message');
const resultsDiv = document.getElementById('results');
const watchlistDiv = document.getElementById('watchlist');

// Search for movies; shows a message if the text is too short
async function search(q) {
  if (q.length < 2) {
    message.textContent = 'Please type at least 2 characters.'; // validation message
    return;
  }
  message.textContent = '';
  const res = await fetch('/api/search?q=' + encodeURIComponent(q));
  if (!res.ok) { message.textContent = 'Search failed.'; return; }
  renderResults(await res.json());
}

// Make one movie card (used by both lists); buttonText/onClick set the button
function makeCard(movie, buttonText, onClick) {
  const card = document.createElement('div');
  card.className = 'card';
  if (movie.poster) {
    const img = document.createElement('img');
    img.src = movie.poster;
    img.alt = movie.title;
    card.appendChild(img);
  }
  const title = document.createElement('p');
  title.textContent = movie.title + ' (' + movie.year + ')'; // textContent is safe
  const btn = document.createElement('button');
  btn.textContent = buttonText;
  btn.addEventListener('click', onClick);
  card.append(title, btn);
  return card;
}

// Show the search results as cards
function renderResults(movies) {
  resultsDiv.textContent = ''; // clear old results
  if (movies.length === 0) message.textContent = 'No movies found.';
  movies.forEach(m => {
    resultsDiv.appendChild(makeCard(m, 'Add', () => addToWatchlist(m)));
  });
}

// Send a movie to the server to be saved, then refresh the list
async function addToWatchlist(movie) {
  await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(movie),
  });
  loadWatchlist();
}

// Ask the server for the saved movies and show them
async function loadWatchlist() {
  const res = await fetch('/api/watchlist');
  renderWatchlist(await res.json());
}

// Delete a movie on the server, then refresh the list
async function removeFromWatchlist(id) {
  await fetch('/api/watchlist/' + id, { method: 'DELETE' });
  loadWatchlist();
}

// Show the watchlist as cards with a Remove button
function renderWatchlist(movies) {
  watchlistDiv.textContent = '';
  if (movies.length === 0) watchlistDiv.textContent = 'Nothing saved yet.';
  movies.forEach(m => {
    watchlistDiv.appendChild(makeCard(m, 'Remove', () => removeFromWatchlist(m.id)));
  });
}

// When the form is submitted, search instead of reloading the page
form.addEventListener('submit', event => {
  event.preventDefault();
  search(queryInput.value.trim());
});

// Load the saved watchlist when the page opens
loadWatchlist();
