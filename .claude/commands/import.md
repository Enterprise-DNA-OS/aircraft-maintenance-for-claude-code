---
description: Bring the maintenance programme across from a Veryon due list or status report saved as a spreadsheet: dry run first, then import.
---

1. Make sure the aircraft exist first (`/fleet`), with their hours and cycles on the day the records start.
2. Dry run: `npm run mx -- import veryon <file.csv> --dry-run`. If the file has no aircraft column, add `--reg=<reg>`. Show the counts and anything it could not read.
3. On a yes, run it without `--dry-run`. Running it twice is harmless: items already here are matched on aircraft and item code.
4. Check the due list against the operator's last Veryon due list, line by line: `npm run mx -- due --reg=<reg> --all`.
5. Column names and what maps: `docs/replace-veryon.md`. If the operator's export has other columns, map them in `scripts/mx.mjs` (`importCmd`) and add the case to the smoke test.
