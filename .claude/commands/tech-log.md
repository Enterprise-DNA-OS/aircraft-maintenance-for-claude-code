---
description: Enter the day's flying from the tech log, a pilot's text or a photo of the paper log: hours, cycles or landings, pilot and sector.
---

The operator gives you the flying. Read a photo of a tech log page carefully; if a figure is unclear, ask. Never guess hours.

1. One entry per flight or per day, as the operator keeps it: `npm run mx -- fly <reg> --hours=1.4 --cycles=3 --date=<date> --pilot="Name" --sector="..."`. Hours can be written 1.4 or 1:24.
2. Read the output. If the aircraft was not serviceable before the flight, or the entry takes it past an item, say so plainly at the top: the aircraft flew, or is about to fly, when the records say it should not.
3. Finish with the aircraft's hours now and the next item due (`npm run mx -- due --reg=<reg>`).
