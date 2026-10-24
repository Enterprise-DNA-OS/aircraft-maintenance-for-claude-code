---
description: The directive register by aircraft: every AD and service bulletin for each type, its status, and how much of the compliance window is left.
---

1. Run `npm run mx -- directives --open` for what needs action, or `npm run mx -- directives` for the full register (`--reg=<reg>` for one aircraft, `--sb` to include bulletins with `--open`).
2. Lead with anything PAST its window: that aircraft should not fly until it is assessed and complied with.
3. Offer `/assess` for each unassessed directive.
