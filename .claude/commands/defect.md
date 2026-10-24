---
description: Raise a defect from a pilot's report or an engineer's finding, then defer it against the MEL or put it on a work order.
---

1. Run `npm run mx -- defect <reg> "what is wrong, in the pilot's words" --by="Name"`.
2. Say clearly that an open defect grounds the aircraft until it is deferred or rectified.
3. If the operator says it can be deferred, ask which MEL item and the limit, then: `npm run mx -- defer <defect> --ref="MEL 33-1 (10 days)" --days=10 --by=<engineer>`. Never pick an MEL item yourself.
4. Otherwise offer a work order: `npm run mx -- wo-new <reg> "title" --defects=<defect>`.
