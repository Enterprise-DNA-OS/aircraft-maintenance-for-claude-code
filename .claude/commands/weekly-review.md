---
description: The Monday review, written from three commands: which aircraft can fly, what is due this week and next, and the five things that matter.
---

Run these three and write the review from what they return. Nothing they do not support goes in.

```
npm run mx -- status
npm run mx -- due --hours=30 --days=14
npm run mx -- attention
```

Then, no more than a page:

1. **The week in one line.** From `npm run mx -- stats`: aircraft serviceable, hours flown, items overdue, directives open.
2. **The fleet.** Each aircraft: serviceable or not, and the one thing that decides it.
3. **Due in the next two weeks.** By aircraft, with the downtime each needs.
4. **Directives and defects.** Anything past a window or a deferral limit leads.
5. **People.** Licences and who can release which type.
6. **Five things to do this week**, from the attention list, with why each made it.
7. **One thing to decide.** The single item that needs a person, not a process.

`npm run view -- week` and `npm run view -- airworthiness` render the same numbers as printable pages.
