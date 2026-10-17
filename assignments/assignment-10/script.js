// Fetch + JSON, the same pattern as the api() helper in reel-frontend/app.jsx:
// call fetch(), check res.ok, parse with res.json(), then draw the result.
const API = 'https://api.tvmaze.com';

const $ = (id) => document.getElementById(id);
const stripTags = (html) => (html || '').replace(/<[^>]+>/g, '');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function search(q) {
  $('status').textContent = 'Loading…';
  $('results').innerHTML = '';
  try {
    const data = await getJSON(`${API}/search/shows?q=${encodeURIComponent(q)}`);
    $('status').textContent = data.length ? `${data.length} results for "${q}"` : `Nothing found for "${q}".`;
    $('results').innerHTML = data.map(({ show }) => `
      <article class="card">
        ${show.image ? `<img src="${show.image.medium}" alt="${escapeHtml(show.name)} poster">` : '<div class="noimg">No poster</div>'}
        <div class="body">
          <strong>${escapeHtml(show.name)}</strong>
          <span class="sub">${show.premiered ? show.premiered.slice(0, 4) : '—'} · ★ ${show.rating.average ?? '–'}</span>
          <span class="sub">${show.genres.map(escapeHtml).join(', ')}</span>
          <p>${escapeHtml(stripTags(show.summary).slice(0, 120))}…</p>
        </div>
      </article>`).join('');
  } catch (err) {
    // fetch() itself failing (TypeError) means no network
    $('status').textContent = err instanceof TypeError ? 'Cannot reach the API. Are you online?' : err.message;
  }
}

async function loadPicks() {
  try {
    const picks = await getJSON('picks.json');
    $('picks').innerHTML = picks.map((p) => `<li><strong>${escapeHtml(p.title)}</strong> (${p.year}) — ${escapeHtml(p.reason)}</li>`).join('');
  } catch {
    $('picks').innerHTML = '<li class="sub">Could not load picks.json — open this page through a local server (see README).</li>';
  }
}

$('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (q) search(q);
});

search($('q').value);
loadPicks();
