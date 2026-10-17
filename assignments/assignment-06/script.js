// Linked from index.html with <script src="script.js">.
// Same idea as reel-backend/recommend.js: every swipe adds points to each
// genre of the title, and titles are ranked by "fit" = sum of their genre scores.

const titles = [
  { id: 1, title: 'Inception', year: 2010, rating: 8.4, genres: ['Sci-Fi', 'Thriller'] },
  { id: 2, title: 'Interstellar', year: 2014, rating: 8.4, genres: ['Sci-Fi', 'Drama'] },
  { id: 3, title: 'Parasite', year: 2019, rating: 8.5, genres: ['Thriller', 'Drama'] },
  { id: 4, title: 'Spirited Away', year: 2001, rating: 8.5, genres: ['Animation', 'Fantasy'] },
  { id: 5, title: 'The Hangover', year: 2009, rating: 7.3, genres: ['Comedy'] },
  { id: 6, title: 'Arrival', year: 2016, rating: 7.6, genres: ['Sci-Fi', 'Drama'] },
];

const WEIGHTS = { like: 2, nope: -2 };
let profile = {};   // genre -> score
let swipes = [];    // { id, action }

const fitOf = (t) => t.genres.reduce((sum, g) => sum + (profile[g] || 0), 0);

function render() {
  const genre = document.getElementById('genreFilter').value;

  // filter + map + sort
  const shown = titles
    .filter((t) => !genre || t.genres.includes(genre))
    .map((t) => ({ ...t, fit: fitOf(t) }))
    .sort((a, b) => b.fit - a.fit);

  document.getElementById('titles').innerHTML = shown.map((t) => `
    <li>
      <div>
        <strong>${t.title}</strong> <span class="sub">${t.year} · ★ ${t.rating}</span><br>
        ${t.genres.map((g) => `<span class="tag">${g}</span>`).join('')}
        <span class="tag fit">fit ${t.fit}</span>
      </div>
      <div class="actions">
        <button data-id="${t.id}" data-action="nope">Nope</button>
        <button data-id="${t.id}" data-action="like">Like</button>
      </div>
    </li>`).join('');

  // Object.entries + sort + map
  const entries = Object.entries(profile).sort((a, b) => b[1] - a[1]);
  document.getElementById('profile').innerHTML = entries.length
    ? entries.map(([g, s]) => `<li><span>${g}</span><strong class="${s >= 0 ? 'pos' : 'neg'}">${s}</strong></li>`).join('')
    : '<li class="sub">No swipes yet.</li>';

  // some / every / find / reduce
  const likes = swipes.filter((s) => s.action === 'like').length;
  const lovesSciFi = entries.some(([g, s]) => g === 'Sci-Fi' && s > 0);
  const allSwiped = titles.every((t) => swipes.some((s) => s.id === t.id));
  const best = titles.find((t) => fitOf(t) === Math.max(...titles.map(fitOf)));
  const avgRating = titles.reduce((sum, t) => sum + t.rating, 0) / titles.length;

  document.getElementById('stats').textContent =
    `${swipes.length} swipes (${likes} likes) · likes Sci-Fi: ${lovesSciFi ? 'yes' : 'no'} · ` +
    `swiped everything: ${allSwiped ? 'yes' : 'no'} · top pick: ${swipes.length ? best.title : '—'} · ` +
    `average rating: ${avgRating.toFixed(2)}`;
}

// ---------- events ----------

// One click listener on the list handles every Like/Nope button (event delegation).
document.getElementById('titles').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;
  const title = titles.find((t) => t.id === id);
  title.genres.forEach((g) => { profile[g] = (profile[g] || 0) + WEIGHTS[action]; });
  swipes.push({ id, action });
  render();
});

document.getElementById('genreFilter').addEventListener('change', render);

document.getElementById('reset').addEventListener('click', () => {
  profile = {};
  swipes = [];
  render();
});

// Fill the genre dropdown: flatMap + Set removes duplicates.
const allGenres = [...new Set(titles.flatMap((t) => t.genres))].sort();
document.getElementById('genreFilter').innerHTML += allGenres.map((g) => `<option>${g}</option>`).join('');

// mouse events
document.querySelector('h1').addEventListener('mouseover', (e) => { e.target.style.color = '#dd9a34'; });
document.querySelector('h1').addEventListener('mouseout', (e) => { e.target.style.color = ''; });

// page load event
window.addEventListener('load', render);
