// End-to-end check of every route against a throwaway database. Run: npm test
process.env.DB_FILE = ':memory:';
const assert = require('assert');
const app = require('./server');

const server = app.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/api/watchlist`;
  const call = async (method, url, body) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, data: res.status === 204 ? null : await res.json() };
  };

  try {
    let r = await call('POST', base, { title: 'Inception', medium: 'movie', year: 2010 });
    assert.equal(r.status, 201);
    const id = r.data.item.id;

    r = await call('POST', base, { title: '', medium: 'movie' });
    assert.equal(r.status, 400);

    r = await call('POST', base, { title: 'Dark', medium: 'tv' });
    r = await call('GET', `${base}?medium=tv`);
    assert.equal(r.data.items.length, 1);

    r = await call('PATCH', `${base}/${id}`, { watched: true, rating: 9 });
    assert.equal(r.data.item.watched, 1);
    assert.equal(r.data.item.rating, 9);
    assert.equal(r.data.item.title, 'Inception');

    r = await call('PATCH', `${base}/${id}`, { rating: 11 });
    assert.equal(r.status, 400);

    r = await call('DELETE', `${base}/${id}`);
    assert.equal(r.status, 204);
    r = await call('GET', `${base}/${id}`);
    assert.equal(r.status, 404);

    console.log('tests OK');
  } finally {
    server.close();
  }
});
