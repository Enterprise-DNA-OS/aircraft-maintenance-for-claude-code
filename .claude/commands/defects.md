---
description: Open and deferred defects across the fleet, with deferral limits, the work order each is on and the flights since it was raised.
---

1. Run `npm run mx -- defects` (`--all` includes rectified, `--reg=<reg>` for one aircraft).
2. Lead with deferrals that have expired, then open defects on aircraft that have flown since they were raised.
3. For each, the next step: defer properly against the MEL, or open a work order (`/work-order`).
