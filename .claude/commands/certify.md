---
description: Release a work order to service: refused unless every task is done, the engineer's licence is current and rated for the type, and a review of airworthiness is signed by an engineer with an inspection authorisation.
---

1. Run `npm run mx -- work-order <WO-nnnn>` and show the tasks.
2. Ask the operator which engineer is signing and the certificate of release to service reference, if not given.
3. Run `npm run mx -- certify <WO-nnnn> --by=<engineer> --crs="CRS nnnn"`.
4. If it refuses, give the reason as it is. Never work around it by changing an engineer's licence date or ratings: those change only when the operator shows you the new licence.
5. On success it resets the programme items, closes the defects and says whether the aircraft is serviceable. Report that.
