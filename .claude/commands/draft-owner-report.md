---
description: Draft the monthly maintenance status letter to an aircraft's owner: hours flown, work done, what is due, defects, and anything that needs the owner's decision or money.
---

1. Run `npm run mx -- aircraft <reg> --json`, `npm run mx -- flights --reg=<reg> --days=31 --json` and `npm run mx -- work-orders --json`.
2. Render the formal report: `npm run docs -- maintenance-status`.
3. Write `drafts/owner-report-<reg>-<month>.md`: hours this month and total, work orders released this month, the next three items due with dates, open and deferred defects, and any cost coming (an overhaul, a life-limited part) stated as a fact, not a quote.
4. Never send it. Attach the rendered report when a person sends it.
