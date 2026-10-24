---
description: Fitted components with their own hours and cycles since new, life limits and what is left, and the release certificate on file. Fit and remove parts.
---

- List: `npm run mx -- components [--reg=<reg>] [--llp]`; parts in stores too: `--all`.
- Remove: `npm run mx -- remove <serial> --reason="..."`. The part keeps its hours and cycles for its next aircraft.
- Fit: `npm run mx -- install <serial> <reg> --position="..." --release="CAA Form One nnnn"`. A part not on file also needs `--part=<part no> --desc="..."` and its limits (`--limit-hours`, `--limit-cycles`, `--limit-years --made=<date>`) and its time since new (`--tsn`, `--csn`).
- A release certificate found later: `npm run mx -- release-doc <serial> "CAA Form One nnnn"`.
- Lead with anything over its life limit or with no release certificate.
