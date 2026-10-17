/* React: props, state, hooks, event handling and conditional rendering.
   Login screen (taken from reel-frontend/login.html) -> onboarding genre picker
   (from the Onboarding component in reel-frontend/app.jsx) -> watchlist.
   Data stays in the browser (localStorage) so no server is needed. */
const { useState, useEffect, useRef } = React;

const GENRES = ['Action', 'Animation', 'Comedy', 'Crime', 'Drama', 'Fantasy', 'Horror', 'Romance', 'Sci-Fi', 'Thriller'];
const MOVIES = [
  { id: 1, title: 'Inception', genres: ['Sci-Fi', 'Thriller'] },
  { id: 2, title: 'Interstellar', genres: ['Sci-Fi', 'Drama'] },
  { id: 3, title: 'Parasite', genres: ['Thriller', 'Drama', 'Crime'] },
  { id: 4, title: 'Spirited Away', genres: ['Animation', 'Fantasy'] },
  { id: 5, title: 'Superbad', genres: ['Comedy'] },
  { id: 6, title: 'The Conjuring', genres: ['Horror'] },
  { id: 7, title: 'Mad Max: Fury Road', genres: ['Action', 'Sci-Fi'] },
  { id: 8, title: 'La La Land', genres: ['Romance', 'Drama'] },
];

// ---------- custom hook: state that is saved to localStorage ----------
function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep in memory */ }
  }, [key, value]);
  return [value, setValue];
}

// ---------- PROPS: a labelled input ----------
function Field({ label, type, value, onChange, autoFocus }) {
  return (
    <label className="field">
      {label}
      <input type={type} value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ---------- STATE + EVENTS: login form ----------
function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return setError('Username must be 3–20 letters, numbers or underscores.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    onLogin(username);   // lift the value up to the parent through a prop
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <h1>Welcome <em>back.</em></h1>
      <Field label="Username" type="text" value={username} onChange={setUsername} autoFocus />
      <Field label="Password" type="password" value={password} onChange={setPassword} />
      {error && <div className="form-error" role="alert">{error}</div>}  {/* conditional rendering with && */}
      <button className="btn">Log in</button>
    </form>
  );
}

// ---------- PROPS + STATE: genre chips ----------
function Chip({ label, on, onToggle }) {
  return <button type="button" className={'chip' + (on ? ' on' : '')} onClick={onToggle}>{label}</button>;
}

function Picker({ selected, setSelected }) {
  const toggle = (g) => setSelected((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]));
  return (
    <section className="card">
      <h2>What do you like?</h2>
      <p className="sub">Pick at least 2 genres. ({selected.length} selected)</p>
      <div className="chips">
        {GENRES.map((g) => <Chip key={g} label={g} on={selected.includes(g)} onToggle={() => toggle(g)} />)}
      </div>
    </section>
  );
}

// ---------- hooks: useEffect (document title), useRef (focus) ----------
function Recommendations({ genres, watchlist, setWatchlist }) {
  const listRef = useRef(null);
  const recs = MOVIES.filter((m) => m.genres.some((g) => genres.includes(g)));

  useEffect(() => { document.title = `Reel — ${watchlist.length} saved`; }, [watchlist.length]);

  const save = (m) => {
    setWatchlist((w) => (w.some((x) => x.id === m.id) ? w : [...w, m]));
    listRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <section className="card">
        <h2>Recommended for you</h2>
        {recs.length === 0 ? (                                       /* conditional rendering with ? : */
          <p className="sub">No matches — try more genres.</p>
        ) : (
          <ul className="list">
            {recs.map((m) => {
              const saved = watchlist.some((x) => x.id === m.id);
              return (
                <li key={m.id}>
                  <span><strong>{m.title}</strong> <span className="sub">{m.genres.join(', ')}</span></span>
                  <button className="btn small" disabled={saved} onClick={() => save(m)}>{saved ? 'Saved ✓' : 'Save'}</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card" ref={listRef}>
        <h2>Watchlist ({watchlist.length})</h2>
        {watchlist.length ? (
          <ul className="list">
            {watchlist.map((m) => (
              <li key={m.id}>
                <strong>{m.title}</strong>
                <button className="link-btn" onClick={() => setWatchlist((w) => w.filter((x) => x.id !== m.id))}>Remove</button>
              </li>
            ))}
          </ul>
        ) : <p className="sub">Nothing saved yet.</p>}
      </section>
    </>
  );
}

// ---------- parent: owns the shared state, passes it down as props ----------
function App() {
  const [user, setUser] = useStoredState('reel9User', null);
  const [genres, setGenres] = useStoredState('reel9Genres', []);
  const [watchlist, setWatchlist] = useStoredState('reel9Watchlist', []);

  function logout() {
    setUser(null);
    setGenres([]);
    setWatchlist([]);
  }

  if (!user) return <main className="wrap"><Login onLogin={setUser} /></main>;   // early-return conditional

  return (
    <main className="wrap">
      <header className="bar">
        <span>Hi, <b>{user}</b></span>
        <button className="link-btn" onClick={logout}>Log out</button>
      </header>
      <Picker selected={genres} setSelected={setGenres} />
      {genres.length >= 2
        ? <Recommendations genres={genres} watchlist={watchlist} setWatchlist={setWatchlist} />
        : <p className="sub center">Pick {2 - genres.length} more genre{genres.length === 1 ? '' : 's'} to see recommendations.</p>}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
