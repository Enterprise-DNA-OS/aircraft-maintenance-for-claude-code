---
description: Everything due on one aircraft within a window (programme items, directives, defects not on a work order, life-limited parts to order), ready to open as a work order.
---

1. Run `npm run mx -- work-pack <reg>` (default 30 hours or 40 days; change with `--hours` and `--days`).
2. Present it as the list the engineer will work from, grouped: inspections, directives, defects, parts to order.
3. Offer to open it: the output ends with the `wo-new` command to run. Offer `/draft-work-pack <reg>` if the work goes to an outside maintenance provider.
