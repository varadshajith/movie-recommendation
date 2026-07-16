# Reel — TV Shows, Better Recommendations & UI Consistency

Date: 2026-07-16

## Goal

Three coupled changes to Reel:

1. Add **TV shows** as a separate mode alongside Movies (independent taste profile).
2. **Improve recommendations** on three specific gaps: weak cold start, dumb wildcards, no negative-feedback modeling.
3. **Fix UI inconsistencies**, chiefly missing Like/Nope affordances on mobile.

## Context

Current app:
- `reel-backend/server.js` — Express, TMDB proxy (key server-side only), tag-weighted rec engine. Six signals: `nope -2, like 2, meh -0.5, save 4, seenLoved 5, seenDisliked -4`. Profile is a `{tag: score}` scorecard where tags are `genre:ID`, `kw:name`, `person:name`, `lang:xx`, `decade:2010s`.
- `reel-backend/db.js` — SQLite (better-sqlite3). Tables: `settings`, `profile_tags`, `actions`, `excluded`, `lists`, `movie_cache`. Backend owns ALL state (contract v2); frontend holds only an in-memory queue.
- `reel-frontend/index.html` — single-file vanilla JS swiper. Deck of cards, drag gestures + edge buttons + bottom action bar + keyboard, expanded trailer view, watchlist drawer.

**Decision: fresh-start DB.** The live `reel.db` will be discarded. No migration code — new schema builds clean. Delete `reel.db`, `reel.db-shm`, `reel.db-wal` so `CREATE TABLE IF NOT EXISTS` applies the new schema.

## Architecture

### Medium dimension (backbone)

Parameterize the backend by `medium ∈ {movie, tv}`. Rejected alternative: duplicating movie code as TV code (doubles every future edit — the rec fixes would need writing twice).

**`MEDIA` config in server.js** maps each medium to its TMDB surface and field names:

| | movie | tv |
|---|---|---|
| discover | `/discover/movie` | `/discover/tv` |
| trending | `/trending/movie/week` | `/trending/tv/week` |
| search | `/search/movie` | `/search/tv` |
| detail | `/movie/{id}` | `/tv/{id}` |
| genre list | `/genre/movie/list` | `/genre/tv/list` |
| title field | `title` | `name` |
| date field | `release_date` | `first_air_date` |
| runtime | `runtime` | `episode_run_time[0]` |
| creator/director | crew job `Director` | `created_by[].name` |

A `normalize(d)` helper returns `{title, year, runtime, creator}` so `toCard`, `toDetail`, and `buildTags` stay medium-blind. `getDetails(medium, id)` appends `keywords,credits,videos` for both (TV supports all three).

`genreMap` becomes `{ movie: {}, tv: {} }` — **TV genre IDs differ from movie genre IDs**, so they must not share a map. Both loaded at boot.

### DB schema (new, medium in the key)

```
settings(key, value)                                   -- global, unchanged
profile_tags(medium, tag, score, PRIMARY KEY(medium, tag))
actions(id, medium, movie_id, action, weight, ts)      -- medium column added
excluded(medium, movie_id, until_ts, PRIMARY KEY(medium, movie_id))
lists(medium, movie_id, list, ts, PRIMARY KEY(medium, movie_id, list))
movie_cache(medium, id, json, fetched_at, PRIMARY KEY(medium, id))
```

Every `db.js` helper takes `medium` as its first arg (`bumpTag(medium, tag, delta)`, `getProfileTags(medium)`, `activeExclusions(medium, now)`, etc.). `hasProfile(medium)` — onboarding is per-medium. `resetAll()` still wipes everything except `movie_cache`; add optional `resetAll(medium)` to reset just one medium if needed (YAGNI check — only if a per-medium reset is wanted; otherwise global reset stays).

### API (every endpoint gains `medium`, default `movie`)

- `GET /api/genres?medium=` → that medium's genre list.
- `GET /api/search?q=&medium=` → search that medium.
- `GET /api/state?medium=` → `{onboarded, hintsSeen, watchlist, seenLoved, swipeCount}` for that medium. `onboarded` reflects `hasProfile(medium)`.
- `GET /api/movie/:id?medium=` → detail (name kept for compatibility; serves both media).
- `POST /api/next` body `{count, inQueue, medium}` → cards for that medium.
- `POST /api/action` body `{movieId, action, medium}` → records signal in that medium's tables.
- `POST /api/onboard` body `{genreIds, lovedIds, medium}` → seeds that medium's profile.
- `POST /api/settings` — `hintsSeen` stays global (one hints overlay for both).

### Recommendation engine (three fixes, in `/api/next`)

1. **Cold start.** When `swipeCount(medium) < COLD_THRESHOLD` (~15), seed the main pool from the user's loved titles' TMDB `/{medium}/{id}/recommendations` instead of raw genre-discover. Warm profiles keep genre-discover. Dedup + exclusion rules unchanged.

   **Seed source fix:** `/api/onboard` currently bumps tags and excludes the loved IDs but stores them nowhere retrievable — there is no record of which films seeded the taste. Change onboard to also write lovedIds into the `seenLoved` list (semantically "seen & loved", and it populates the drawer shelf too). Cold-start then reads seed IDs from the `seenLoved` list for `/recommendations`. If the list is empty (e.g. onboarded via genres only), fall back to genre-discover.

2. **Smart wildcards.** The 30% wildcard slice stops being global trending. It discovers from taste-adjacent signals: top `person:` tags via discover `with_people` (resolve person names→IDs is not available cheaply, so use the **next-tier genres**, profile rank 4–8, as the primary adjacency signal; keep `with_people` only if a person→id is already known). Global trending remains the final fallback when the profile is too cold to produce adjacency. Wildcards still flagged `isWildcard:true`.

3. **Negative feedback.** Compute strongly-negative genres (profile `genre:` tags with score `< NEG_GENRE_THRESHOLD`, e.g. `-3`). Pass them as `without_genres` to the main discover call so disliked genres are filtered out of the pool, not merely down-sorted after fetch. The existing `fit` sort still applies on top.

Constants (`COLD_THRESHOLD`, `NEG_GENRE_THRESHOLD`, wildcard rank window) are named, not magic. They are heuristics — leave them tunable.

### Frontend (index.html)

- **Movies/TV segmented toggle** under the brand (`.brand` row). A `MEDIUM` client variable (`'movie'`/`'tv'`) is attached to every request. Switching medium: clear the in-memory `state.queue`, then re-run `boot()`-style hydration (`/api/state` + `/api/next`) for the new medium. If the new medium isn't onboarded yet, drop into onboarding for it. `state` keeps per-medium `watchlist`/`seenLoved` (refetched on switch — no need to cache both).
- **UI fixes:**
  - Add **Like** and **Nope** buttons to the bottom action bar so mobile (where `.swipe-btn` is `display:none`) has tap access to the two most common actions. Desktop edge buttons stay.
  - Complete the **hints overlay**: add the Seen control (currently omitted).
  - Visually separate **Reset** from the safe icon buttons (it is destructive and currently sits between Help and Watchlist). Keep the `confirm()`.
- Onboarding copy adapts to medium ("films you love" → "shows you love" when `MEDIUM==='tv'`).

## Build order

1. **`db.js`** — new medium-keyed schema; every helper takes `medium`. Delete old `reel.db*`.
2. **`server.js`** — `MEDIA` config, `normalize`, dual `genreMap`, all endpoints threaded with `medium`.
3. **Rec engine** — cold-start, smart-wildcard, negative-feedback logic in `/api/next`.
4. **`index.html`** — Movies/TV toggle, `MEDIUM` var on all requests, UI fixes.

Phases 1–2 are the plumbing (TV works, dumb recs). Phase 3 improves recs independently. Phase 4 is pure frontend. Each phase is testable on its own.

## Testing

- **server.js `runSelfTest()`** — extend to cover `normalize` for a TV payload (`name`/`first_air_date`/`episode_run_time`/`created_by`) and confirm `buildTags`/`toCard` produce the same shape as movie. Assert genre maps stay separate.
- **frontend `#selftest`** — existing pure-helper checks (`fmtRuntime`, `mergeQueue`, `initials`) still pass; add a check that request builders include `medium`.
- **Manual smoke:** onboard Movies, swipe; toggle to TV, onboard, swipe; confirm profiles don't cross-contaminate; confirm mobile viewport shows Like/Nope buttons.

## Out of scope (YAGNI)

- Cross-medium unified deck (explicitly chose separate modes).
- Person name→TMDB id resolution for `with_people` wildcards (use genre adjacency instead unless a cheap id is already on hand).
- Per-medium hints overlays (one shared overlay).
- Trailer/detail changes beyond field normalization.
