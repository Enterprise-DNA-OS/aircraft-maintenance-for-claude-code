---
description: Record a directive: add it to the register, and record each aircraft's assessment (open, not-applicable, complied, recurring). A recurring one goes onto the due list.
---

- A new directive from the authority's notice: `npm run mx -- directive-new <number> --title="..." --type=<AS350|R44|...> --effective=<date> [--within-hours=10] [--by=<date>] [--recurring] [--authority="CAA NZ"]`. A service bulletin adds `--sb`.
- The assessment, signed by an engineer: `npm run mx -- assess <number> <reg> <open|not-applicable|complied|recurring> --by=<engineer> [--notes="..."]`.
- Not applicable needs the reason in `--notes` (serial range, modification state).
- Recurring needs the repeat interval: `--hours=50` and or `--days=365`. It then appears on `/due`.
- Read the directive text from the operator. Never decide applicability yourself; record what the engineer decides.
