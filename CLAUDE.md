# Aircraft Maintenance for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs doing, what is wrong, what is late | `/attention` |
| The Monday review | `/weekly-review` |
| A quick picture of the fleet | `/stats`, `/fleet` |
| Can this aircraft fly, why is it grounded | `/status` |
| One aircraft in full | `/aircraft` |
| The day's flying to enter (tech log page, photo, text) | `/tech-log` |
| Flying for a period, hours per day | `/flights`, `/utilisation` |
| What is due, what is coming up | `/due`, `/forecast` |
| What to put in the next downtime | `/work-pack` |
| Open a work order, mark a task done | `/work-order` |
| Release work to service | `/certify` |
| A defect to raise or defer | `/defect` |
| Open and deferred defects | `/defects` |
| A new AD or SB, an aircraft's assessment | `/assess` |
| The directive register | `/directives` |
| Parts fitted, removed, life left, release certificates | `/components` |
| Add or change a programme item, aircraft status | `/programme` |
| Engineers, licences, ratings | `/engineers` |
| Are we compliant | `/compliance` |
| Reports, work orders, AD records to print | `/documents` |
| A dashboard | `/view`, `/new-view` |
| A work pack to a maintenance provider | `/draft-work-pack` |
| The owner's monthly report | `/draft-owner-report` |
| Book a review of airworthiness | `/draft-ara-booking` |
| Data from Veryon | `/import` |
| All the data out | `/export` |
| A note on an aircraft | `/log` |
| Change a field, a rule, an interval | `/customise` |

If an ask fits nothing here, run the CLI directly (`npm run mx -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Never tell anyone an aircraft is serviceable when `mx status` says it is not. This is a records check: the engineer and the pilot in command make the airworthiness call.
- Never enter hours, cycles or a last-done figure you had to guess. Ask.
- Never change an engineer's licence date, ratings or authorisation to get a release through. Those change only when the operator shows the new licence.
- Never decide whether a directive applies or pick an MEL item. Record what the engineer decides.

## Where things live

- `scripts/mx.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Veryon.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/veryon
