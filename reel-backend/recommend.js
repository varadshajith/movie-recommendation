// The recommendation engine: "which cards should this user see next?"
//
//   1. The taste profile is a score per tag (see tmdb.buildTags). Swipes add or
//      subtract points from every tag of the title (WEIGHTS in server.js).
//   2. MAIN cards (70%) come from the user's top-3 genres, minus disliked genres,
//      and are ranked by "fit" = sum of the title's tag scores.
//      New users (few swipes) instead get TMDB recommendations of titles they loved.
//   3. WILDCARD cards (30%) come from the next-best genres, to widen their taste.
const db = require('./db');
const tm = require('./tmdb');

const COLD_START_SWIPES = 15; // fewer swipes than this -> seed from loved titles
const DISLIKED_GENRE = -3;    // genre score at/below this is filtered out
const WILDCARD_SHARE = 0.3;
const OVERFETCH = 3;          // fetch extra candidates so ranking has choice

const genreIds = (scores, keep) =>
  Object.entries(scores).filter(([tag, s]) => tag.startsWith('genre:') && keep(s)).map(([tag]) => tag.slice(6));

// TMDB "discover" for the given genres (OR), excluding disliked ones.
const discover = (medium, withGenres, withoutGenres) => (page) =>
  tm.listPage(`/discover/${medium}`, {
    include_adult: 'false', 'vote_count.gte': '100', sort_by: 'popularity.desc', page,
    ...(withGenres.length && { with_genres: withGenres.join('|') }),
    ...(withoutGenres.length && { without_genres: withoutGenres.join(',') }),
  });

// Collect up to `needed` ids not in `skip` by trying a few random result pages.
// Adds what it picks to `skip`, so pools never hand out the same title twice.
async function pick(fetchPage, needed, skip) {
  const pages = [1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, 4);
  const ids = [];
  for (const page of pages) {
    if (ids.length >= needed) break;
    const results = await fetchPage(page).catch(() => []); // one bad page must not fail the batch
    for (const m of results) {
      if (skip.has(m.id)) continue;
      skip.add(m.id);
      ids.push(m.id);
    }
  }
  return ids;
}

async function nextCards(uid, medium, count, inQueue) {
  const scores = db.getProfileTags(uid, medium);
  const skip = new Set([...db.hiddenIds(uid, medium, Date.now()), ...inQueue]);

  const liked = genreIds(scores, (s) => s > 0).sort((a, b) => scores[`genre:${b}`] - scores[`genre:${a}`]);
  const top = liked.slice(0, 3);
  const adjacent = liked.slice(3, 8);
  const avoid = genreIds(scores, (s) => s <= DISLIKED_GENRE);

  const wildCount = Math.round(count * WILDCARD_SHARE);
  const mainCount = count - wildCount;
  const want = mainCount * 2 + OVERFETCH;

  // MAIN pool
  let mainIds = [];
  const loved = db.getList(uid, medium, 'seenLoved');
  if (db.swipeCount(uid, medium) < COLD_START_SWIPES && loved.length) {
    const seed = loved[Math.floor(Math.random() * Math.min(loved.length, 5))];
    mainIds = await pick((page) => tm.listPage(`/${medium}/${seed}/recommendations`, { page }), want, skip);
  }
  if (mainIds.length < mainCount) {
    mainIds = mainIds.concat(await pick(discover(medium, top, avoid), want - mainIds.length, skip));
  }

  // WILDCARD pool (falls back to trending when there is no second-tier taste yet)
  const wildFetch = adjacent.length
    ? discover(medium, adjacent, avoid)
    : (page) => tm.listPage(`/trending/${medium}/week`, { page });
  const wildIds = await pick(wildFetch, wildCount + OVERFETCH, skip);

  // details (cached) -> card + fit score; a title that fails to load is just skipped
  const load = async (ids, isWildcard) => {
    const items = await Promise.all(ids.map(async (id) => {
      try {
        const d = await tm.getDetails(medium, id);
        const fit = tm.buildTags(medium, d).reduce((sum, t) => sum + (scores[t] || 0), 0);
        return { card: { ...tm.toCard(medium, d, scores), isWildcard }, fit };
      } catch {
        return null;
      }
    }));
    return items.filter(Boolean);
  };

  const mains = (await load(mainIds, false)).sort((a, b) => b.fit - a.fit).slice(0, mainCount).map((x) => x.card);
  const wilds = (await load(wildIds, true)).slice(0, wildCount).map((x) => x.card);

  // sprinkle wildcards at random positions
  const cards = [...mains];
  for (const w of wilds) cards.splice(Math.floor(Math.random() * (cards.length + 1)), 0, w);
  return cards.slice(0, count);
}

module.exports = { nextCards };
