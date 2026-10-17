// DOM manipulation + events: the Reel swipe deck in plain JavaScript.
// The drag logic is the same as the Card component in reel-frontend/app.jsx
// (Pointer Events, threshold, stamps that fade in while dragging).
const THRESHOLD = 100; // px of drag needed to commit
const TAP_SLOP = 7;    // less movement than this counts as a tap

const queue = [
  { title: 'Inception', year: 2010, rating: 8.4, hue: 20, overview: 'A thief who steals secrets through dream-sharing is given one last job.' },
  { title: 'Interstellar', year: 2014, rating: 8.4, hue: 200, overview: 'Explorers travel through a wormhole to save humanity.' },
  { title: 'Parasite', year: 2019, rating: 8.5, hue: 330, overview: 'A poor family schemes its way into a wealthy household.' },
  { title: 'Spirited Away', year: 2001, rating: 8.5, hue: 140, overview: 'A girl is trapped in a world of spirits and must free her parents.' },
  { title: 'Arrival', year: 2016, rating: 7.6, hue: 260, overview: 'A linguist tries to talk to visitors from another world.' },
];
const watchlist = [];

const deck = document.getElementById('deck');
const EXIT = { like: [1.3, 0], nope: [-1.3, 0], save: [1.3, 0], meh: [0, -1.2] };

// ---------- creating elements ----------
function makeCard(movie, pos) {
  const el = document.createElement('article');
  el.className = `card pos${pos}`;
  el.style.setProperty('--h', movie.hue);
  el.innerHTML = `
    <div class="stamp like">LIKE</div>
    <div class="stamp nope">NOPE</div>
    <div class="stamp meh">MEH</div>
    <div class="info">
      <strong></strong>
      <span>${movie.year} · ★ ${movie.rating}</span>
      <p class="overview" hidden></p>
    </div>`;
  el.querySelector('strong').textContent = movie.title;          // textContent: safe, no HTML parsing
  el.querySelector('.overview').textContent = movie.overview;
  return el;
}

function renderDeck() {
  deck.replaceChildren();                                         // remove old cards
  if (!queue.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = "You've seen them all!";
    return deck.append(p);
  }
  // add back-to-front so the top card is last in the DOM (on top)
  queue.slice(0, 3).reverse().forEach((m, i, arr) => deck.append(makeCard(m, arr.length - 1 - i)));
  enableDrag(deck.lastElementChild);
}

// ---------- actions ----------
function act(action) {
  const el = deck.querySelector('.card.pos0:not(.fly)'); // ignore a card that is already flying away
  if (!el) return;
  const movie = queue.shift();
  if (action === 'save') {
    watchlist.push(movie.title);
    updateWatchlist();
  }
  const li = document.createElement('li');
  li.textContent = `${action.toUpperCase()} — ${movie.title}`;
  document.getElementById('log').prepend(li);

  const [x, y] = EXIT[action];
  el.classList.add('fly');
  el.style.transform = `translate(${x * innerWidth}px, ${y * innerHeight}px) rotate(${x * 20}deg)`;
  el.addEventListener('transitionend', renderDeck, { once: true });
}

function updateWatchlist() {
  document.getElementById('wlCount').textContent = watchlist.length;
  document.getElementById('wlList').innerHTML = '';
  for (const t of watchlist) {
    const li = document.createElement('li');
    li.textContent = t;
    document.getElementById('wlList').appendChild(li);
  }
}

// ---------- drag with Pointer Events ----------
function enableDrag(el) {
  const stamp = (name) => el.querySelector(`.stamp.${name}`);
  let startX = 0, startY = 0, dx = 0, dy = 0, active = false;

  el.addEventListener('pointerdown', (e) => {
    active = true; startX = e.clientX; startY = e.clientY; dx = dy = 0;
    el.classList.remove('settle');
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    el.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
    const vertical = Math.abs(dy) > Math.abs(dx);
    stamp('like').style.opacity = !vertical && dx > 0 ? Math.min(1, dx / THRESHOLD) : 0;
    stamp('nope').style.opacity = !vertical && dx < 0 ? Math.min(1, -dx / THRESHOLD) : 0;
    stamp('meh').style.opacity = vertical && dy < 0 ? Math.min(1, -dy / THRESHOLD) : 0;
  });
  const release = () => {
    if (!active) return;
    active = false;
    const vertical = Math.abs(dy) > Math.abs(dx);
    if (Math.abs(dx) + Math.abs(dy) < TAP_SLOP) { const o = el.querySelector('.overview'); o.hidden = !o.hidden; } // tap toggles info
    if (vertical && dy < -THRESHOLD) return act('meh');
    if (!vertical && dx > THRESHOLD) return act('like');
    if (!vertical && dx < -THRESHOLD) return act('nope');
    el.classList.add('settle');                               // spring back
    el.style.transform = '';
    el.querySelectorAll('.stamp').forEach((s) => { s.style.opacity = 0; });
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
}

// ---------- buttons + keyboard ----------
document.querySelector('.actionbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) act(btn.dataset.action);
});

const KEYS = { ArrowLeft: 'nope', ArrowRight: 'like', ArrowUp: 'meh', Enter: 'save' };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return (document.getElementById('drawer').hidden = true);
  if (KEYS[e.key]) { e.preventDefault(); act(KEYS[e.key]); }
});

document.getElementById('wlBtn').addEventListener('click', () => { document.getElementById('drawer').hidden = false; });
document.getElementById('closeDrawer').addEventListener('click', () => { document.getElementById('drawer').hidden = true; });

document.addEventListener('DOMContentLoaded', renderDeck);
