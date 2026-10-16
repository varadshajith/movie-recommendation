// One runnable check for the logic that matters. Run: npm test  (no network needed)
const assert = require('assert');
const tm = require('./tmdb');
const { hashPassword, passwordMatches } = require('./auth');

// --- tags + card for a movie and a TV show (their TMDB fields differ) ---
const movie = {
  id: 27205, title: 'Inception', release_date: '2010-07-16', vote_average: 8.369, runtime: 148,
  poster_path: '/p.jpg', original_language: 'en',
  genres: [{ id: 878, name: 'Science Fiction' }],
  keywords: { keywords: [{ name: 'dream' }] },
  videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'abc' }] },
  credits: { crew: [{ job: 'Director', name: 'Christopher Nolan' }], cast: [{ name: 'Leonardo DiCaprio' }] },
};
const tags = tm.buildTags('movie', movie);
assert(tags.includes('genre:878') && tags.includes('kw:dream') && tags.includes('decade:2010s'));
assert(tags.includes('person:Christopher Nolan') && tags.includes('person:Leonardo DiCaprio'));

tm.genreNames.movie[878] = 'Science Fiction';
const card = tm.toCard('movie', movie, { 'genre:878': 5, 'person:Christopher Nolan': 4 });
assert.equal(card.rating, 8.4);
assert.equal(card.trailerKey, 'abc');
assert.equal(card.reason, 'Because you like Science Fiction & Christopher Nolan');

const show = {
  id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', episode_run_time: [45],
  poster_path: '/b.jpg', created_by: [{ name: 'Vince Gilligan' }], genres: [{ id: 18 }],
};
const tvCard = tm.toDetail('tv', show, {});
assert.equal(tvCard.title, 'Breaking Bad');
assert.equal(tvCard.year, 2008);
assert.equal(tvCard.runtime, 45);
assert.equal(tvCard.director, 'Vince Gilligan');

// --- password hashing ---
const stored = hashPassword('secret123');
assert(passwordMatches('secret123', stored));
assert(!passwordMatches('wrong', stored));
assert.notEqual(hashPassword('secret123'), stored); // random salt

console.log('tests OK');
