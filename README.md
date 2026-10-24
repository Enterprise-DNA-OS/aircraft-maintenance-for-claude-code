<h1 align="center">Aircraft Maintenance for Claude Code</h1>

<p align="center">
  <strong>The open-source aircraft maintenance tracking system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Veryon data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=veryon">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/veryon?utm_source=github&utm_medium=readme&utm_campaign=veryon">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-veryon">Instead of Veryon</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Aircraft Maintenance for Claude Code does the maintenance tracking you pay Veryon for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Veryon dashboard cannot.

Veryon charges an annual subscription for each aircraft on the system, varying by make and model, plus a one-time enrollment fee for onboarding, and quotes the price privately ([veryon.com/products/veryon-tracking](https://veryon.com/products/veryon-tracking), checked 24 October 2026). The bill grows with every tail you add. This costs nothing, or a setup fee and a retainer if Enterprise DNA runs it for you.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=veryon).

It is built for a helicopter, charter, agricultural or training operator with two to twenty aircraft: the tech log (hours and cycles), the maintenance programme with intervals in hours, cycles and days, components and their life limits, the directive register and each aircraft's assessment, defects and MEL deferrals, work orders and the release to service, and the engineers who sign. The words are the words a maintenance controller already uses.

**Nothing sends or talks to another system on its own.** Work packs, owner reports and booking requests are drafted here and a person sends them. The gates are real, though: a release is refused if a task is not done, the engineer's licence has lapsed or does not cover the type, or a review of airworthiness is signed without an inspection authorisation; a part cannot be fitted to two aircraft; a removed part keeps its own hours and cycles.

```
/attention                 everything that wants a decision, worst first
/status                    is this aircraft good to fly today, and why not
/tech-log                  the day's flying from the tech log or a photo of it
/due                       the due list by hours, cycles and days, with dates at the current rate of flying
/work-pack                 everything due on one aircraft, ready to open as a work order
/certify                   release to service, with the licence and rating checks
/directives                the AD register and what is left of each compliance window
/compliance                nine rules: directives, overdue items, life limits, the review of airworthiness, releases, deferrals, parts certificates
/weekly-review             the Monday review, written from three commands
```

Every due date reads one view, `item_due`: the last-done point plus the interval, against the hours and cycles the tech log says the aircraft has now. The due list, the status check, the work pack and the compliance check can never disagree about what is due.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No per-aircraft fee, no tiers, no modules. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/aircraft-maintenance-for-claude-code.git
cd aircraft-maintenance-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database and loads Southern Lakes Aviation (a made-up Queenstown operator with two AS350s, an R44, a Caravan and an Airvan, and 45 days of tech log: a new directive with a 10 hour window not yet assessed after 10.2 hours of flying, a 100 hour inspection flown 3.4 hours past, a tail rotor blade 2.3 hours over its life limit, a review of airworthiness five days overdue, a magneto job released by an engineer whose licence lapsed 4 October, starter generator work done and never released with the helicopter flown since, a pitot heat deferral four days past its MEL limit, a starter generator fitted with no release certificate, and an open defect on an aircraft that kept flying), then prints the fleet, the due list and the compliance check.

Then open the folder in Claude Code and type:

```
/attention
```

Try `/status ZK-SLB`, `/due`, `/work-pack SLA`, `/directives`, `/components`. When you are ready for real data, delete `.data/` and start with `/import`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md), and put your name, logo and colours in [brand.json](brand.json) so the reports and work orders carry them.

## Your first hour: ten things to ask for

1. "What needs attention today?"
2. "Is ZK-SLB good to fly tomorrow morning?"
3. "Here is the photo of today's tech log for SLA. Enter it."
4. "What is due on the fleet in the next 30 hours or six weeks?"
5. "Build the work pack for SLA's 600 hour and open it."
6. "CAA has issued a new AD on the AS350 tail rotor coupling. Add it and tell me which aircraft it hits."
7. "Hemi finished the 100 hour on SLB. Release it, CRS 0415."
8. "Kate says the starter generator on SLA is slow to engage. Raise a defect."
9. "Bring in this Veryon due list for the R44."
10. "Draft the monthly maintenance report for the R44's owner."

## Ten questions answered from your own records

Every one is a real command or query on the demo data today.

1. Which aircraft can fly today, and what exactly is stopping the others? (`status`)
2. Which new directives have not been assessed, and how many hours has each aircraft flown since they took effect? (`directives --open`)
3. What falls due across the fleet in the next 90 days, in date order, at the rate each aircraft is actually flying? (`forecast`)
4. Which aircraft flew past an inspection, and by how much? (`compliance`, rule R2)
5. Which life-limited parts are within 50 hours of their limit, wherever they are fitted now? (`components --llp`)
6. Which work was released by an engineer whose licence had lapsed or who holds no rating for the type? (`compliance`, rule R5)
7. Which aircraft flew with work done but not released, or with a defect neither fixed nor deferred? (`compliance` R6 and R9)
8. Which deferrals run out this week, and how many flights has each deferred defect flown? (`defects`)
9. What should go into the next downtime on SLA so it is on the ground once, not twice? (`work-pack`)
10. Which parts are fitted with no release certificate on file? (`compliance` R8)

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-aircraft fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first: aircraft that should not fly, then what is coming up. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/stats` | The fleet in five lines. |
| `/fleet` | Every aircraft: hours, cycles, last 30 days, serviceable or not. |
| `/status` | Is this aircraft good to fly today, and why not. |
| `/aircraft` | One aircraft in full: programme, components, defects, work orders, notes. |
| `/tech-log` | Enter the day's flying from the tech log, a text or a photo. |
| `/flights` | The tech log for a period. |
| `/utilisation` | Hours, cycles and days flown by aircraft. |
| `/due` | The due list by hours, cycles and days, with dates at the current rate of flying. |
| `/forecast` | What falls due over the next 90 days, life-limited parts included. |
| `/work-pack` | Everything due on one aircraft inside a window, ready to open as a work order. |
| `/work-orders` | Work orders, open first, with tasks done and who released them. |
| `/work-order` | Open a work order, mark tasks done, show one in full. |
| `/certify` | Release to service, refused without a current licence, the type rating or an inspection authorisation. |
| `/defects` | Open and deferred defects, deferral limits, flights since raised. |
| `/defect` | Raise a defect, then defer it against the MEL or put it on a work order. |
| `/directives` | The directive register by aircraft, with what is left of each compliance window. |
| `/assess` | Add a directive and record each aircraft's assessment; recurring ones go on the due list. |
| `/components` | Fitted parts with time and cycles since new, life left and release certificates. Fit and remove. |
| `/programme` | Add or change a programme item, or an aircraft's status. |
| `/engineers` | Licences, ratings, inspection authorisations and recent releases. |
| `/compliance` | Nine rules checked against the records, each with its source. |
| `/documents` | Maintenance status reports, work orders and directive records in your brand. |
| `/view` | The fleet, airworthiness and engineers dashboards as printable pages. |
| `/new-view` | Add a dashboard in plain language. |
| `/draft-work-pack` | Draft the work pack email to an outside maintenance provider. |
| `/draft-owner-report` | Draft the monthly maintenance status letter to an aircraft owner. |
| `/draft-ara-booking` | Draft the request to book a review of airworthiness. |
| `/import` | Bring the programme across from a Veryon due list export. |
| `/export` | Every table to CSV. |
| `/log` | A dated note on an aircraft. |
| `/customise` | Change a field, a rule or an interval in plain language. |

Every command is a short recipe over one CLI: `npm run mx -- help` lists it all.

## Instead of Veryon

Set up your aircraft, engineers and components by asking for them, export the due list for each aircraft from Veryon as CSV, then:

```
npm run mx -- import veryon due-list.csv --dry-run
npm run mx -- import veryon due-list.csv
```

Put the due list next to your last Veryon due list before you switch. The full guide, what maps and what does not: [docs/replace-veryon.md](docs/replace-veryon.md). The rules the compliance check uses, with sources: [docs/compliance.md](docs/compliance.md).

## Architecture

```
aircraft-maintenance-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/mx.mjs            the one CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis, the compliance rules and the Veryon guide
  documents.json, views.json  the paperwork and dashboards, as SQL
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Aircraft Maintenance for Claude Code for your business, migrates your Veryon data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=veryon)
- Read more: [enterprisedna.co/omni/instead-of/veryon](https://enterprisedna.co/omni/instead-of/veryon?utm_source=github&utm_medium=readme&utm_campaign=veryon)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
