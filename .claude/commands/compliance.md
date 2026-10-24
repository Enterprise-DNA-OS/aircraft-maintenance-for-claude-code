---
description: Check the records against the rules in docs/compliance.md: directives, overdue items, life limits, the review of airworthiness, releases, deferrals, parts certificates and open defects.
---

1. Run `npm run mx -- compliance` (add `--json` for every breach, not just the worst).
2. Report as a table: rule, count, the worst example, the source from `docs/compliance.md`. Breached first.
3. For each breach, the fix the operator can approve: the work order to open, the assessment to record, the aircraft to hold on the ground.
4. If a rule in `docs/compliance.md` looks out of date, say so and stop. Do not guess at rules. The operator confirms the rule, then you update the doc and the check together.

This is a records check, not legal advice and not a substitute for the engineer's judgement or your exposition.
