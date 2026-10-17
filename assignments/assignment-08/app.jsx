/* A basic Single Page Application with React functional components and JSX.
   "Pages" (Home / Browse / About) switch without reloading the browser page —
   the URL hash (#/browse) tells the App which page component to draw. */
const { useState, useEffect } = React;

const MOVIES = [
  { id: 1, title: 'Inception', year: 2010, rating: 8.4, genres: ['Sci-Fi', 'Thriller'], hue: 20 },
  { id: 2, title: 'Interstellar', year: 2014, rating: 8.4, genres: ['Sci-Fi', 'Drama'], hue: 200 },
  { id: 3, title: 'Parasite', year: 2019, rating: 8.5, genres: ['Thriller', 'Drama'], hue: 330 },
  { id: 4, title: 'Spirited Away', year: 2001, rating: 8.5, genres: ['Animation', 'Fantasy'], hue: 140 },
  { id: 5, title: 'Arrival', year: 2016, rating: 7.6, genres: ['Sci-Fi', 'Drama'], hue: 260 },
  { id: 6, title: 'Whiplash', year: 2014, rating: 8.4, genres: ['Drama', 'Music'], hue: 0 },
];

// ---------- small components ----------
function Header({ page }) {
  const link = (to, label) => <a href={`#/${to}`} className={page === to ? 'on' : ''}>{label}</a>;
  return (
    <header className="topbar">
      <span className="brand">Reel</span>
      <nav>{link('home', 'Home')}{link('browse', 'Browse')}{link('about', 'About')}</nav>
    </header>
  );
}

function GenreChips({ genres }) {
  return <div className="chips">{genres.map((g) => <span className="chip" key={g}>{g}</span>)}</div>;
}

function MovieCard({ movie }) {
  return (
    <article className="card">
      <div className="poster" style={{ '--h': movie.hue }}>{movie.title}</div>
      <div className="body">
        <strong>{movie.title}</strong>
        <span className="sub">{movie.year} · ★ {movie.rating.toFixed(1)}</span>
        <GenreChips genres={movie.genres} />
      </div>
    </article>
  );
}

// ---------- pages ----------
function Home() {
  const top = [...MOVIES].sort((a, b) => b.rating - a.rating).slice(0, 3);
  return (
    <section>
      <h1>Pick your next <em>film.</em></h1>
      <p className="sub">Top rated this week:</p>
      <div className="grid">{top.map((m) => <MovieCard key={m.id} movie={m} />)}</div>
    </section>
  );
}

function Browse() {
  return (
    <section>
      <h1>Browse</h1>
      <div className="grid">{MOVIES.map((m) => <MovieCard key={m.id} movie={m} />)}</div>
    </section>
  );
}

function About() {
  return (
    <section>
      <h1>About Reel</h1>
      <p>Reel is a movie recommender. This SPA shows the React side of it:</p>
      <ul>
        <li>Functional components: <code>Header</code>, <code>MovieCard</code>, <code>GenreChips</code>, pages</li>
        <li>JSX for the markup, <code>{'{ }'}</code> for JavaScript values</li>
        <li>One HTML page; React swaps the page component when the URL hash changes</li>
      </ul>
    </section>
  );
}

const PAGES = { home: Home, browse: Browse, about: About };
const currentPage = () => location.hash.replace('#/', '') || 'home';

// ---------- root component ----------
function App() {
  const [page, setPage] = useState(currentPage());

  useEffect(() => {
    const onHash = () => setPage(currentPage());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const Page = PAGES[page] || Home;
  return (
    <>
      <Header page={page} />
      <main className="wrap"><Page /></main>
      <footer className="foot">Reel · React SPA demo</footer>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
