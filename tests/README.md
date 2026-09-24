# Tests for 苏门答腊飑线 Sumatra Squall Watch

Run once: `npm install`, then `npm test` (Node 20 or newer). No network access is needed — every data feed is replaced by synthetic data.

| File | What it checks |
|---|---|
| `smoke.js` | Whole page in all three languages, both nights, squall / easterly / missing-data / failed-radar scenarios |
| `detector_test.js` | Radar colour classes, band detection, movement, arrival times, coverage limits, scoring engine |
| `findings_test.js` | Reproductions of the 2026-09-25 review findings (stale forecast, CAPE-only score, partial coverage, location race, mixed-source motion, cache deletion, live expiry, stale point cache, stalled response body) |
| `review_test.js` | Model switch during a load, guide state, strip tap, old radar labelling |
| `share_test.js` | QR code and WhatsApp / copy-link in all languages |
| `worker_test.mjs` | The optional NEA proxy Worker: origins, allowed paths, missing secret |

These prove the code does what it is written to do. They do **not** calibrate the thresholds against real squalls — that needs historical radar and observed squall mornings.
