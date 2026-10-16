/* Reel — main app as a React single-page application (CO3).
   Loaded by index.html through Babel (no build step).
   Components: App (state + screens) > Onboarding, Card, ActionBar, DetailView, Drawer, Hints.
   The backend owns all data; this file draws the screen and sends swipes. */
const { useState, useEffect, useRef } = React;

const API = `http://${location.hostname}:8181`;
const token = localStorage.getItem('reelToken');
const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
let MEDIUM = 'movie';   // read by api(); App keeps a matching state value so React re-renders

function leave() {
  localStorage.removeItem('reelToken');
  localStorage.removeItem('reelUser');
  location.replace('login.html');
}

// GET when `body` is omitted, POST otherwise. Always sends the login token.
async function api(path, body) {
  const url = body ? path : path + (path.includes('?') ? '&' : '?') + 'medium=' + MEDIUM;
  const res = await fetch(API + url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body && JSON.stringify({ medium: MEDIUM, ...body }),
  });
  if (res.status === 401) { leave(); throw new Error('Not logged in'); }
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

/* ------------------------------------------------------------ small helpers */
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const noun = (medium, plural) => (medium === 'tv' ? (plural ? 'shows' : 'show') : (plural ? 'films' : 'film'));

function fmtRuntime(min) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

// SVG icon: pass the path data as children
const Icon = ({ w = 2, children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IconX = (p) => <Icon w={2.4} {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
const IconCheck = () => <Icon w={2.4}><path d="M20 6L9 17l-5-5" /></Icon>;
const IconMinus = () => <Icon w={2.4}><path d="M5 12h14" /></Icon>;
const IconBookmark = () => <Icon><path d="M6 4h12v17l-6-4-6 4z" /></Icon>;
const IconInfo = () => <Icon><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Icon>;
const IconEye = () => <Icon><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></Icon>;
const Star = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.5l7.1-.6z" /></svg>;

// "2010 · ★ 8.4 · 2h 28m"
function Meta({ card, className }) {
  const parts = [card.year, <><span className="star"><Star /></span> <b>{(card.rating || 0).toFixed(1)}</b></>, fmtRuntime(card.runtime)].filter(Boolean);
  return (
    <div className={className}>
      {parts.map((p, i) => <React.Fragment key={i}>{i > 0 && <span style={{ opacity: 0.4 }}>·</span>}{p}</React.Fragment>)}
    </div>
  );
}
const GenreChips = ({ genres }) => <div className="gchips">{genres.map((g) => <span className="gchip" key={g}>{g}</span>)}</div>;

/* ============================================================ ONBOARDING
   Step 1: pick genres.  Step 2: search and pick 3–5 titles you already love. */
function Onboarding({ medium, onDone }) {
  const [step, setStep] = useState(1);
  const [genres, setGenres] = useState(null);       // null = loading, [] = error
  const [selected, setSelected] = useState([]);     // genre ids
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [picks, setPicks] = useState([]);           // card objects
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/genres').then((d) => setGenres(d.genres)).catch(() => setGenres([]));
  }, []);

  // typeahead: wait 220ms after typing stops, ignore answers to old queries
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    let stale = false;
    const timer = setTimeout(() => {
      api('/api/search?q=' + encodeURIComponent(q)).then((d) => { if (!stale) setResults(d.results || []); }).catch(() => {});
    }, 220);
    return () => { stale = true; clearTimeout(timer); };
  }, [query]);

  const toggleGenre = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const togglePick = (card) => setPicks((p) => (p.some((m) => m.id === card.id) ? p.filter((m) => m.id !== card.id) : p.length < 5 ? [...p, card] : p));

  async function finish() {
    setBusy(true);
    setError('');
    try {
      await api('/api/onboard', { genreIds: selected, lovedIds: picks.map((m) => m.id) });
      onDone();
    } catch {
      setBusy(false);
      setError('Could not reach the server — try again');
    }
  }

  const ready = step === 1 ? selected.length >= 1 : picks.length >= 3;
  const note = step === 1
    ? (selected.length ? `${selected.length} selected` : 'Pick at least one genre')
    : (picks.length < 3 ? `Add ${3 - picks.length} more` : 'Ready');

  return (
    <section className="onb">
      <div className="onb-head">
        <h1>Set your <em>taste.</em></h1>
        <p>{step === 1 ? 'Pick the genres you gravitate to.' : `Name a few ${noun(medium, true)} you already love.`}</p>
        <div className="steps"><i className="on" /><i className={step === 2 ? 'on' : ''} /></div>
      </div>

      {step === 1 ? (
        <div className="panel glass">
          <h2>Genres</h2>
          <div className="chips">
            {genres === null && <span className="hint">Loading…</span>}
            {genres && !genres.length && <span className="hint">Cannot reach the server — run <b>npm start</b> in reel-backend, then reload.</span>}
            {(genres || []).map((g) => (
              <button key={g.id} className={'chip' + (selected.includes(g.id) ? ' sel' : '')} onClick={() => toggleGenre(g.id)}>{g.name}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel glass">
          <h2>{medium === 'tv' ? 'Shows' : 'Films'} you love <span className="hint">{picks.length}/5</span></h2>
          <input className="search" type="search" aria-label="Search by title" autoComplete="off"
                 placeholder={`Search a ${noun(medium, false)} you love…`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="results">
            {results.filter((c) => c.poster).slice(0, 8).map((c) => (
              <div key={c.id} title={c.title} onClick={() => togglePick(c)}
                   className={'result' + (picks.some((m) => m.id === c.id) ? ' picked' : '')}
                   style={{ backgroundImage: `url("${c.poster}")` }} />
            ))}
          </div>
          <div className="hint">Add 3–5 favourites so we can read your taste.</div>
          <div className="picked-row">
            {picks.map((c) => (
              <div className="mini" key={c.id} style={{ backgroundImage: `url("${c.poster}")` }}>
                <button aria-label={'Remove ' + c.title} onClick={() => togglePick(c)}><IconX /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="onb-foot">
        <span className="count-note">{error || note}</span>
        {step === 2 && <button className="btn ghost" onClick={() => setStep(1)}>Back</button>}
        <button className="btn" disabled={!ready || busy} onClick={() => (step === 1 ? setStep(2) : finish())}>
          {busy ? 'Reading taste…' : step === 1 ? 'Continue' : 'Start swiping'}
        </button>
      </div>
    </section>
  );
}

/* ============================================================ DECK */
const THRESHOLD = 100;  // px of drag needed to commit
const TAP_SLOP = 7;     // less movement than this counts as a tap

// Where a card flies off to for each action: [x, y, rotation]
const EXIT = {
  like: () => [innerWidth * 1.3, -40, 22],
  nope: () => [-innerWidth * 1.3, -40, -22],
  meh: () => [0, -innerHeight * 1.2, 0],
  seenLoved: () => [0, -innerHeight * 1.2, 0],
  seenDisliked: () => [-innerWidth * 1.3, -40, -22],
};

// One card in the stack. Only the top card (pos 0) is draggable.
// Drag right = like, left = nope, up = meh, down (or tap) = info.
function Card({ card, pos, onFly, onOpen }) {
  const ref = useRef(null);

  useEffect(() => {
    if (pos !== 0) return;
    const el = ref.current;
    const like = el.querySelector('.stamp.like'), nope = el.querySelector('.stamp.nope');
    const meh = el.querySelector('.stamp.meh'), cue = el.querySelector('.info-cue');
    let startX = 0, startY = 0, dx = 0, dy = 0, active = false;

    const springBack = () => {
      el.classList.add('settle');
      el.style.transform = '';
      like.style.opacity = nope.style.opacity = meh.style.opacity = cue.style.opacity = 0;
    };
    const down = (e) => {
      active = true; startX = e.clientX; startY = e.clientY; dx = dy = 0;
      el.classList.remove('settle');
      el.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!active) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;
      el.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
      const vertical = Math.abs(dy) > Math.abs(dx);
      like.style.opacity = !vertical && dx > 0 ? Math.min(1, dx / THRESHOLD) : 0;
      nope.style.opacity = !vertical && dx < 0 ? Math.min(1, -dx / THRESHOLD) : 0;
      meh.style.opacity = vertical && dy < 0 ? Math.min(1, -dy / THRESHOLD) : 0;
      cue.style.opacity = vertical && dy > 0 ? Math.min(1, dy / THRESHOLD) : 0;
    };
    const release = () => {
      if (!active) return;
      active = false;
      const vertical = Math.abs(dy) > Math.abs(dx);
      if (Math.abs(dx) + Math.abs(dy) < TAP_SLOP || (vertical && dy > THRESHOLD)) { springBack(); onOpen(card); }
      else if (vertical && dy < -THRESHOLD) onFly(el, card, 'meh');
      else if (dx > THRESHOLD) onFly(el, card, 'like');
      else if (dx < -THRESHOLD) onFly(el, card, 'nope');
      else springBack();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
    };
  }, [pos, card]);

  return (
    <article ref={ref} className={`card pos${pos}`}>
      <div className="poster" style={{ backgroundImage: `url('${card.poster}')` }} />
      <div className="scrim" />
      {card.isWildcard && <div className="wild">Wildcard</div>}
      {pos === 0 && (
        <>
          {card.reason && <div className="why">{card.reason}</div>}
          <div className="stamp like">LIKE</div>
          <div className="stamp nope">NOPE</div>
          <div className="stamp meh">MEH</div>
          <div className="info-cue"><span className="chev"><Icon w={2.2}><path d="M6 9l6 6 6-6" /></Icon></span><small>Info</small></div>
          <div className="info glass">
            <div className="info-body">
              <div className="title">{card.title}</div>
              <Meta card={card} className="meta" />
              <GenreChips genres={card.genres.slice(0, 3)} />
              {card.overview && <p className="overview">{card.overview}</p>}
            </div>
          </div>
        </>
      )}
    </article>
  );
}

/* ============================================================ DETAIL VIEW (trailer + cast) */
function DetailView({ card, medium, onAct, onClose }) {
  const [full, setFull] = useState(null);
  const [seenChoice, setSeenChoice] = useState(false);

  useEffect(() => {
    setFull(null);
    setSeenChoice(false);
    if (!card) return;
    let stale = false;
    api('/api/movie/' + card.id).then((d) => { if (!stale) setFull(d.movie); }).catch(() => {});
    return () => { stale = true; };
  }, [card && card.id]);

  const m = full || card;
  const picture = m && (m.backdrop || m.poster);

  return (
    <>
      <div className={'expand-scrim' + (card ? ' open' : '')} onClick={onClose} />
      <section className={'expand glass' + (card ? ' open' : '')} role="dialog" aria-modal="true" aria-label="Details">
        <button className="icon-btn expand-close" aria-label="Close" onClick={onClose}><IconX /></button>
        {m && (
          <>
            <div className="expand-media">
              {full && full.trailerKey ? (
                <iframe src={`https://www.youtube.com/embed/${encodeURIComponent(full.trailerKey)}?autoplay=1&rel=0&modestbranding=1`}
                        title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              ) : picture ? (
                <><img src={picture} alt={`${m.title} poster`} />{!full && <div className="m-load">Loading trailer…</div>}</>
              ) : <div className="m-load">No trailer available</div>}
            </div>
            <div className="expand-body">
              <div className="expand-title">{m.title}</div>
              {m.tagline && <div className="expand-tag">“{m.tagline}”</div>}
              <Meta card={m} className="expand-meta" />
              <GenreChips genres={m.genres || []} />
              {m.overview && <p className="expand-overview">{m.overview}</p>}
              {m.director && <div className="expand-dir">{medium === 'tv' ? 'Created' : 'Directed'} by <b>{m.director}</b></div>}
              {m.cast && m.cast.length > 0 && (
                <>
                  <div className="cast-head">Cast</div>
                  <div className="cast-row">
                    {m.cast.map((p) => (
                      <div className="cast" key={p.name}>
                        <div className="ph" style={p.photo ? { backgroundImage: `url('${p.photo}')` } : undefined}>{p.photo ? '' : initials(p.name)}</div>
                        <div className="nm">{p.name}</div>
                        {p.character && <div className="ch">{p.character}</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className={'seen-choice' + (seenChoice ? ' open' : '')}>
              <button className="loved" onClick={() => onAct('seenLoved')}>Loved it</button>
              <button className="disliked" onClick={() => onAct('seenDisliked')}>Not for me</button>
            </div>
            <div className="expand-actions">
              <button className="act nope" aria-label="Pass" onClick={() => onAct('nope')}><IconX /></button>
              <button className="act meh" aria-label="Meh — not sure" onClick={() => onAct('meh')}><IconMinus /></button>
              <button className="act seen" aria-label="Already seen it" onClick={() => setSeenChoice((v) => !v)}><IconEye /></button>
              <button className="act save" aria-label="Save to watchlist" onClick={() => onAct('save')}><IconBookmark /></button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

/* ============================================================ SMALL PANELS */
function Drawer({ open, watchlist, seenLoved, onClose }) {
  const [tab, setTab] = useState('watchlist');
  const list = tab === 'watchlist' ? watchlist : seenLoved;
  return (
    <>
      <div className={'scrim-bg' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'drawer glass' + (open ? ' open' : '')} aria-label="Saved titles">
        <div className="drawer-head">
          <h2>Saved</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><IconX /></button>
        </div>
        <div className="tabs">
          <button className={'tab' + (tab === 'watchlist' ? ' on' : '')} onClick={() => setTab('watchlist')}>Watchlist</button>
          <button className={'tab' + (tab === 'seenLoved' ? ' on' : '')} onClick={() => setTab('seenLoved')}>Seen &amp; Loved</button>
        </div>
        <div className="grid">
          {list.length === 0 && (
            <div className="drawer-empty">
              {tab === 'watchlist' ? 'Press Enter (or the bookmark) on titles you must watch — they land here.' : 'Mark titles you’ve seen & loved to build this shelf.'}
            </div>
          )}
          {list.map((c) => (
            <div className="gitem" key={c.id} style={{ backgroundImage: `url("${c.poster}")` }}><div className="t">{c.title}</div></div>
          ))}
        </div>
      </aside>
    </>
  );
}

function Hints({ open, onClose }) {
  const rows = [
    [<Icon><path d="M19 12H5M12 19l-7-7 7-7" /></Icon>, 'Pass', 'not for me'],
    [<Icon><path d="M5 12h14M12 5l7 7-7 7" /></Icon>, 'Like', 'want to watch'],
    [<Icon><path d="M12 19V5M5 12l7-7 7 7" /></Icon>, 'Meh', 'not sure'],
    [<Icon><path d="M12 5v14M19 12l-7 7-7-7" /></Icon>, 'Info', '+ trailer'],
    ['S', 'Seen', 'it — loved or not'],
    ['ENTER', 'Save', 'to watchlist'],
  ];
  return (
    <div className={'hints-scrim' + (open ? ' open' : '')} onClick={onClose}>
      <div className="hints-panel glass">
        <h2>How to <span>swipe</span></h2>
        <div className="hint-rows">
          {rows.map(([key, bold, rest]) => (
            <div className="hint-row" key={bold}>
              <span className="hint-key">{key}</span>
              <span className="hint-label"><b>{bold}</b> — {rest}</span>
            </div>
          ))}
        </div>
        <div className="hint-foot">Press any key or tap to start</div>
      </div>
    </div>
  );
}

/* ============================================================ APP */
function App() {
  const [medium, setMedium] = useState('movie');
  const [phase, setPhase] = useState('loading');      // 'loading' | 'onboarding' | 'deck'
  const [queue, setQueue] = useState([]);
  const [deckState, setDeckState] = useState('loading'); // 'loading' | 'ready' | 'offline'
  const [watchlist, setWatchlist] = useState([]);
  const [seenLoved, setSeenLoved] = useState([]);
  const [hintsSeen, setHintsSeen] = useState(true);
  const [showHints, setShowHints] = useState(false);
  const [detail, setDetail] = useState(null);         // card shown in the detail view
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const [toast, setToast] = useState('');

  const ambA = useRef(null), ambB = useRef(null);
  const ambIsA = useRef(false);
  const refilling = useRef(false);
  const live = useRef({});                  // always the latest state, for event handlers
  live.current = { medium, queue, hintsSeen, showHints, detail, drawerOpen, popOpen, phase };

  /* ---- load this medium's state, then go to deck or onboarding ---- */
  async function hydrate() {
    setPhase('loading');
    try {
      const s = await api('/api/state');
      setHintsSeen(s.hintsSeen);
      setWatchlist(s.watchlist);
      setSeenLoved(s.seenLoved);
      if (s.onboarded) enterDeck(s.hintsSeen); else setPhase('onboarding');
    } catch {
      setPhase('onboarding');               // server unreachable: onboarding shows its own message
    }
  }

  async function enterDeck(seen) {
    setPhase('deck');
    setQueue([]);
    setDeckState('loading');
    await refill(true);
    if (seen === false) setShowHints(true);
  }

  // Ask the backend for more cards when the queue runs low.
  async function refill(initial) {
    if (refilling.current) return;
    refilling.current = true;
    const forMedium = MEDIUM;               // ignore the answer if the user switched Movies/TV meanwhile
    try {
      const inQueue = initial ? [] : live.current.queue.map((c) => c.id);
      const { cards } = await api('/api/next', { count: 10, inQueue });
      if (forMedium !== MEDIUM) return;
      setQueue((q) => {
        const have = new Set(q.map((c) => c.id));
        return q.concat(cards.filter((c) => !have.has(c.id)));
      });
      setDeckState('ready');
    } catch {
      if (forMedium === MEDIUM && !live.current.queue.length) setDeckState('offline');
    } finally {
      refilling.current = false;
    }
  }

  useEffect(() => { if (token) hydrate(); else leave(); }, []);

  // Cross-fade the blurred key art behind the top card.
  const top = queue[0];
  useEffect(() => {
    const url = top && (top.backdrop || top.poster);
    if (!url) return;
    const [incoming, outgoing] = ambIsA.current ? [ambA.current, ambB.current] : [ambB.current, ambA.current];
    incoming.style.backgroundImage = `url("${url}")`;
    incoming.classList.add('on');
    outgoing.classList.remove('on');
    ambIsA.current = !ambIsA.current;
  }, [top && top.id]);

  useEffect(() => { document.body.dataset.screen = phase === 'deck' ? 'deckScreen' : 'onboarding'; }, [phase]);

  /* ---- actions: every one is a single POST; UI updates first ---- */
  function showToast(text) {
    setToast(text);
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => setToast(''), 1500);
  }

  function commit(action, card) {
    if (!card) return;
    if (action === 'save') {
      setWatchlist((w) => (w.some((c) => c.id === card.id) ? w : [card, ...w]));
      showToast('Saved to watchlist');
    }
    if (action === 'seenLoved') setSeenLoved((s) => (s.some((c) => c.id === card.id) ? s : [card, ...s]));
    api('/api/action', { movieId: card.id, action }).catch(() => { /* card already advanced */ });
    const remaining = live.current.queue.filter((c) => c.id !== card.id);
    setQueue(remaining);
    if (remaining.length < 4) refill(false);
  }

  // Animate the top card away, then record the action.
  function fly(el, card, action) {
    const [x, y, rot] = EXIT[action]();
    el.classList.add('fly');
    el.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg)`;
    el.style.opacity = '0';
    reduceMotion ? commit(action, card) : setTimeout(() => commit(action, card), 340);
  }

  // Bottom-bar buttons and keyboard shortcuts both end up here.
  function doAction(action) {
    const card = live.current.queue[0];
    const el = document.querySelector('.deck .pos0');
    if (!card || !el || el.classList.contains('state')) return;
    if (action === 'seen') return setPopOpen((v) => !v);
    if (action === 'expand') return setDetail(card);
    if (action === 'save') return commit('save', card);
    fly(el, card, action);                  // like | nope | meh
  }

  function markSeen(action) {
    setPopOpen(false);
    doActionFly(action);
  }
  function doActionFly(action) {
    const card = live.current.queue[0];
    const el = document.querySelector('.deck .pos0');
    if (card && el) fly(el, card, action);
  }

  // act from inside the detail view, then close it
  function detailAct(action) {
    const card = live.current.detail;
    setDetail(null);
    commit(action, card);
  }

  function dismissHints() {
    setShowHints(false);
    if (!live.current.hintsSeen) {
      setHintsSeen(true);
      api('/api/settings', { hintsSeen: true }).catch(() => {});
    }
  }

  async function switchMedium(next) {
    if (next === MEDIUM) return;
    MEDIUM = next;
    setMedium(next);
    setDrawerOpen(false); setDetail(null); setPopOpen(false);
    setQueue([]); setWatchlist([]); setSeenLoved([]);
    await hydrate();
  }

  async function reset() {
    if (!confirm('Reset Reel and start over? This wipes your taste, watchlist and history.')) return;
    try { await api('/api/reset', {}); } catch { /* reload anyway */ }
    location.reload();
  }

  /* ---- keyboard: arrow keys mirror every gesture ---- */
  useEffect(() => {
    const KEYS = { ArrowLeft: 'nope', ArrowRight: 'like', ArrowUp: 'meh', ArrowDown: 'expand' };
    const onKey = (e) => {
      const s = live.current;
      if (s.showHints) { e.preventDefault(); return dismissHints(); }
      if (s.detail) {
        if (e.key === 'Escape' || e.key === 'ArrowDown') { e.preventDefault(); return setDetail(null); }
        if (e.key === 'Enter') { e.preventDefault(); return detailAct('save'); }
        if (KEYS[e.key] && KEYS[e.key] !== 'expand') { e.preventDefault(); detailAct(KEYS[e.key]); }
        return;
      }
      if (e.key === 'Escape') {
        if (s.drawerOpen) return setDrawerOpen(false);
        if (s.popOpen) return setPopOpen(false);
      }
      if (s.phase !== 'deck' || e.target.tagName === 'INPUT') return;
      if (e.key === '?') { e.preventDefault(); return setShowHints(true); }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); return setPopOpen((v) => !v); }
      if (e.key === 'Enter') { e.preventDefault(); return doAction('save'); }
      if (KEYS[e.key]) { e.preventDefault(); doAction(KEYS[e.key]); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // clicking anywhere else closes the "seen it" popover
  useEffect(() => {
    const onClick = (e) => { if (!e.target.closest('.pop, [data-act="seen"]')) setPopOpen(false); };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  /* ---- render ---- */
  const stack = queue.slice(0, 3);
  return (
    <>
      <div className="stage" aria-hidden="true">
        <div className="amb" ref={ambA} />
        <div className="amb" ref={ambB} />
        <div className="glow" /><div className="vignette" /><div className="grain" />
      </div>

      <header className="topbar">
        <div className="brand"><span className="dot" />REEL</div>
        <div className="medium-toggle" role="tablist" aria-label="Movies or TV">
          <button className={medium === 'movie' ? 'on' : ''} role="tab" aria-selected={medium === 'movie'} onClick={() => switchMedium('movie')}>Movies</button>
          <button className={medium === 'tv' ? 'on' : ''} role="tab" aria-selected={medium === 'tv'} onClick={() => switchMedium('tv')}>TV</button>
        </div>
        <div className="top-right">
          <button className="icon-btn" aria-label="Show the controls" title="Controls (?)" onClick={() => setShowHints(true)}>
            <Icon><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></Icon>
          </button>
          <button className="icon-btn" aria-label="Open watchlist" title="Watchlist" onClick={() => setDrawerOpen(true)}>
            <IconBookmark />
            <span className={'badge' + (watchlist.length ? '' : ' zero')}>{watchlist.length}</span>
          </button>
          <button className="icon-btn" aria-label="Log out" title="Log out"
                  onClick={() => api('/api/logout', {}).catch(() => {}).finally(leave)}>
            <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Icon>
          </button>
          <span className="tb-divider" aria-hidden="true" />
          <button className="icon-btn danger" aria-label="Reset and start over" title="Reset" onClick={reset}>
            <Icon><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /></Icon>
          </button>
        </div>
      </header>

      <main className="app">
        {phase === 'onboarding' && <Onboarding key={medium} medium={medium} onDone={() => enterDeck(hintsSeen)} />}
        {phase === 'deck' && (
          <section className="deck-screen">
            <div className="deck">
              {stack.length > 0 && stack.map((c, i) => <Card key={c.id} card={c} pos={i} onFly={fly} onOpen={setDetail} />)}
              {stack.length === 0 && deckState === 'loading' && <div className="card state skeleton pos0" />}
              {stack.length === 0 && deckState === 'offline' && (
                <div className="card state empty pos0"><div className="big">Server offline</div><div>Start the backend (npm start) and reload.</div></div>
              )}
              {stack.length === 0 && deckState === 'ready' && (
                <div className="card state empty pos0"><div className="big">That’s the reel</div><div>You’ve seen everything we lined up. Check back soon.</div></div>
              )}
            </div>
          </section>
        )}
      </main>

      {phase === 'deck' && (
        <div className="actions glass">
          <button className="act nope" aria-label="Pass — not for me" onClick={() => doAction('nope')}><IconX /></button>
          <button className="act sm meh" aria-label="Meh — not sure (swipe up)" onClick={() => doAction('meh')}><IconMinus /></button>
          <button className="act sm openinfo" aria-label="Info and trailer (swipe down)" onClick={() => doAction('expand')}><IconInfo /></button>
          <button className="act sm seen" data-act="seen" aria-label="Already seen it" onClick={() => doAction('seen')}><IconEye /></button>
          <button className="act sm save" aria-label="Save to watchlist (Enter)" onClick={() => doAction('save')}><IconBookmark /></button>
          <button className="act like" aria-label="Like — want to watch" onClick={() => doAction('like')}><IconCheck /></button>
        </div>
      )}

      <div className={'pop glass' + (popOpen ? ' open' : '')}>
        <button className="loved" onClick={() => markSeen('seenLoved')}>Loved it</button>
        <button className="disliked" onClick={() => markSeen('seenDisliked')}>Not for me</button>
      </div>

      <DetailView card={detail} medium={medium} onAct={detailAct} onClose={() => setDetail(null)} />
      <Drawer open={drawerOpen} watchlist={watchlist} seenLoved={seenLoved} onClose={() => setDrawerOpen(false)} />
      <Hints open={showHints} onClose={dismissHints} />

      <div className={'toast glass' + (toast ? ' show' : '')}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h12v17l-6-4-6 4z" /></svg>
        <span>{toast || 'Saved'}</span>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
