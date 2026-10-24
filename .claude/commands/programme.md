---
description: Add or change an item in an aircraft's maintenance programme (an inspection, an overhaul, a component replacement), or change an aircraft's status.
---

- Add or change an item: `npm run mx -- item-add <reg> <code> --title="..." --kind=inspection|overhaul|component|review|directive --hours=<n> | --cycles=<n> | --days=<n> | --months=<n> [--done-on=<date>] [--done-hours=<n>] [--ref="manual reference"]`.
- The interval comes from the manufacturer's programme or your approved schedule. Ask for the reference; never make one up.
- Aircraft status: `npm run mx -- aircraft-status <reg> <active|maintenance|stored|sold>`. Back to active reports anything still stopping it.
