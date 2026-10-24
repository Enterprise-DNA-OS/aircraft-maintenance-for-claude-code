# Moving off Veryon

A day or two for one person, done in this order. Keep Veryon running until a full due list from this system matches the last one from Veryon, line by line, for every aircraft.

## 1. Set up the aircraft and the people

These are short lists, quicker to enter by asking Claude Code than to export:

- **Aircraft.** Registration, the type as the directives name it (AS350, R44, C208), make and model, serial, base, owner if you manage it for someone else, and the airframe hours and cycles on the day these records start.
- **Engineers.** Licence number and expiry, the types they are rated for, and whether they hold an inspection authorisation.
- **Components.** Every life-limited and tracked part: part number, serial, position, limits in hours, cycles or years, its own time and cycles since new on the day it was fitted, the aircraft hours when it was fitted, and the release certificate reference.

Ask in plain words: "add ZK-SLA, an AS350 B3, serial 7811, based Queenstown, 8,360.0 hours and 21,410 landings at 1 September" and Claude Code writes the rows.

## 2. Export the due list

Run the due list or status report for each aircraft in Veryon, with every item showing (not just what is due soon), and save or export it as a spreadsheet. Save it as CSV. If your report has no aircraft column, export one aircraft at a time and pass `--reg` on import.

## 3. Import

```
npm run mx -- import veryon due-list.csv --dry-run
npm run mx -- import veryon due-list.csv
```

The dry run writes nothing and reports anything it could not read. Running the import twice is harmless: an aircraft and item code already here is matched and only updated if something changed.

### What maps

One row per tracked item. Columns are matched by name, ignoring case, with the common variants of each header:

| This system | Headers it accepts |
|---|---|
| Aircraft | Registration, Aircraft, Tail Number, Tail, Reg (or `--reg`) |
| Item code | Item Number, Item, Task Number, Task, ATA Code, Reference, Code |
| Title | Description, Item Description, Task Description, Title |
| Kind | Item Type, Type, Category (AD or directive, overhaul or TBO, component, review; anything else is an inspection) |
| Interval | Interval Hours, Interval Cycles (or Landings Interval), Interval Months or Interval Days |
| Last done | Last Done Date (or Last Complied Date), Last Done Hours, Last Done Cycles |

Months become days at 365 a year. Dates are read as written in New Zealand and Australia (DD/MM/YYYY) or as YYYY-MM-DD. A row whose item looks like a directive (an AD type, or a number starting DCA, AD, EASA, FAA or CASA) goes onto the directive register too, marked recurring if it has an interval and complied if it does not.

### What does not carry over

- **Directive text and applicability.** The import brings the number, the title and the last compliance. The effective date, the compliance window and the authority are entered from the directive itself (`directive-new`), and each aircraft's assessment is re-recorded by an engineer (`assess`).
- **The tech log history.** Only the hours and cycles on the start day are needed. Bring older flights across only if you want the history here; the due list does not need them.
- **Scanned logbooks and task cards.** Keep the files where they are and note the reference in the item's reference field.
- **Work orders, parts inventory and flight scheduling** from Veryon's other modules. Open work orders are re-entered by hand; history stays in your export.

A different report layout has other columns. Mapping it is part of what Enterprise DNA does when we set this up for you, or ask Claude Code to map it: the import is `importCmd` in `scripts/mx.mjs`, and the smoke test shows the shape.

## 4. Check before you switch

```
npm run mx -- due --reg=ZK-SLA --all
npm run mx -- components --reg=ZK-SLA
npm run mx -- directives --reg=ZK-SLA
```

Put each next to the matching Veryon report. A difference is almost always an interval in months against days, a last-done figure entered against the wrong aircraft hours, or a component's time since new on the day it was fitted. Fix it here, then switch.

## 5. From then on

Enter the day's flying with `/tech-log`, open work with `/work-pack` and `/work-order`, release it with `/certify`, and read `/attention` every morning.
