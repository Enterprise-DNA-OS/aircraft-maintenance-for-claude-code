---
description: Open a work order from programme items and defects, mark tasks done, and show one work order in full.
---

- Show one: `npm run mx -- work-order <WO-nnnn>`.
- Open one: `npm run mx -- wo-new <reg> "title" --items=100HR,ARA --defects=D-0029 --task="any other task"`. Use `/work-pack <reg>` first to see what should go in it.
- Mark a task done: `npm run mx -- done <WO-nnnn> <line> --by=<engineer code> [--date=<date>]`.
- Doing a task does not release the aircraft. That is `/certify`.
- Render the paper copy: `npm run docs -- work-order`.
