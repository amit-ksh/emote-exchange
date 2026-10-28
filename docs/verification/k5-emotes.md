# K5 emote catalog verification

Completed October 28, 2026. Scope: provider parsing, cached runtime, normalizer integration, original demo assets and dashboard counts. No dependency was added.

## Automated checks

`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm smoke` passed. The suite has 73 tests: 64 in Twitch Kit and 9 in the app.

- `provider response fixtures produce named images, animated flags and provider keys`: Twitch, 7TV, BTTV and FFZ response parsing, authoritative Twitch CDN URLs, WebP selection and animation flags.
- `channel wrappers preserve 7TV aliases and merge BTTV channel/shared emotes`: channel response shapes, aliases and valid empty sets.
- `channel beats global, then Twitch, 7TV, BTTV and FFZ; matching is case sensitive`: collision precedence and exact name matching.
- `malformed entries and hostile image URLs cannot become browser data`: malformed catalogs and foreign image hosts are rejected. Only approved HTTPS CDN URLs or local demo paths reach the browser.
- `all 24 original demo assets are immediately available with every network request failing`: complete original catalog before any request, available after all requests fail, with no private provider errors in public state.
- `last good sets persist, failed refresh restores cached data, and 30-minute scheduling bounds calls`: SQLite reload, last-good fallback, refresh cadence, and actual catalog lookup plugged into the normalizer to recognize a 7TV text token as an emote.
- `manual refresh does not postpone the scheduled 30-minute refresh`: a review test first failed because a manual refresh caused the next periodic refresh to be skipped. Scheduled refreshes now run every 30 minutes independently of manual requests.
- `late channel responses cannot restore another account's catalog after disconnect or close`: aborted requests cannot persist stale channel sets after auth changes or shutdown.
- `channel cache never leaks across accounts and no-keys startup makes no authenticated requests`: per-broadcaster channel scopes, reusable global cache, and only three optional public-global requests without auth.
- `empty successful sets replace old rows and 404 reports no channel set without inventing data`: authoritative empty results remove old entries while failures retain last-good data.
- `a linked 7TV profile with no active emote set reports setup needed`: a failing test caught HTTP 200 with `emote_set: null` incorrectly showing Ready. It now reports No channel set.
- App tests verify the 24-emote no-credentials projection and guard on refresh. Production smoke verifies local demo images and snapshot/SSE behavior while independent background updates advance sequence numbers.

Responses are bounded to 5 MiB and 10,000 entries per source. Writes replace each provider/scope in one transaction, using bound SQL parameters. Successful empty sets retain metadata so they remain distinguishable from missing cache data. Browser projections include eight fixed source summaries and at most 30 sample emotes; provider error bodies, tokens and incoming chat stay private.

## Live provider check

Saved auth restored after restart and both Twitch emote requests returned HTTP 200. Initial 7TV and BTTV channel requests returned 404; FFZ returned an empty channel set. The streamer then linked 7TV and added one emote to the assigned channel set. A guarded local refresh returned the following public state:

| Provider | Channel | Global | Observed result |
|---|---:|---:|---|
| Twitch | 0 | 299 | Ready, HTTP 200 |
| 7TV | 1 | 45 | Ready, HTTP 200; channel emote `BOB`, animated |
| BTTV | 0 | 65 | No channel set, HTTP 404; globals ready |
| FFZ | 0 | 15 | Ready, HTTP 200; empty channel set |
| Bundled demo | 24 | — | Local SVG assets |

The catalog contained 437 unique names after collision resolution. These are observed counts, not fixed expectations for future provider sets. The channel sample contained `7tv:01H0GW2E1R00086RBX6GCMW5AE`, `BOB` and its approved CDN image URL. No outgoing chat action was used for this check.

## Browser and offline checks

The built dashboard was checked in Edge at 1920 × 1080 and 960 × 540: provider cells matched the public snapshot, Refresh emotes worked, names and images rendered, and no horizontal overflow or page errors occurred. The 24 original SVGs were individually requested over HTTP and visually inspected together. The dashboard shows a bounded sample rather than every emote at once.

A separate process with empty Twitch credentials and fetch blocked started in about 366 ms in the observed run and exposed exactly the 24 demo names. The real `/overlay` route remained transparent and correctly scaled at 1920 × 1080 and 960 × 540. A subsequent in-app browser check confirmed that all six sampled local thumbnails decoded successfully with provider access blocked; the initial section screenshot had been captured before lazy image loading completed. These are browser checks, not an actual OBS application check.

Screenshots and local verification helpers remain git-ignored in `artifacts/k5/`. K6 simulator and K7 final setup panels remain pending, followed by the Exchange market and full overlay.
