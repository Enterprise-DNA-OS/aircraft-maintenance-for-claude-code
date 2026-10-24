---
description: Draft the request to book a review of airworthiness with an engineer who holds an inspection authorisation, for an aircraft whose review is coming due.
---

1. Run `npm run mx -- due --all --json` and take the ARA items due within 30 days, then `npm run mx -- engineers --json` for who holds an inspection authorisation.
2. Run `npm run mx -- work-pack <reg> --days=45 --json` so anything else due can be done at the same visit.
3. Write `drafts/ara-<reg>-<date>.md`: the aircraft, the due date, dates it can be on the ground, and the other items worth doing at the same time.
4. Never send it. Say where the draft is.
