# Why there is no front end

Veryon is a database with a subscription. The records underneath it are ordinary: aircraft, a tech log, a programme of items with intervals, components with limits, directives, defects and work orders. What you pay for, per aircraft per year, is the layer on top that lets people who do not write SQL get at those records, plus the analysts who keep them up to date.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it, and explains the answer. Ask a question the dashboard never had a report for and you still get an answer.

## What you gain

- **Better answers.** A due list shows what the vendor decided to show. Here you ask "which aircraft can I put on the Milford run tomorrow, and what is due on it before Friday?" and get it answered from your own records.
- **No per-aircraft fee.** Adding a sixth helicopter adds a row, not a line on an invoice.
- **Your records in your Postgres.** Plain tables. Back them up, query them from anything, leave any time.
- **Checks that refuse.** A release by an engineer with a lapsed licence is refused at the point of entry, not found at audit.

## What you give up

- **A phone app for pilots.** The tech log is entered from a photo, a text or a spreadsheet. A phone form for pilots is something Enterprise DNA builds into a customised version.
- **Analysts applying directives for you.** Veryon's analysts apply new ADs and SBs to your programme. Here an engineer reads the directive and records the assessment, with the system counting the hours against the window. Enterprise DNA can do the register upkeep as part of running it for you.
- **Manufacturer data feeds and the technical publications library.** Keep your publications subscription. This holds the records, not the manuals.
- **A visual board.** Work orders are a table you ask about, not cards you drag.

## Who this fits

Operators with two to twenty aircraft whose engineers and office already know their programme, and who want the answers more than the screens. If you need an outside analyst team to run the programme for you, keep that service, or have Enterprise DNA run this one for you.

Installed and run for you: https://enterprisedna.co/omni/instead-of/veryon
