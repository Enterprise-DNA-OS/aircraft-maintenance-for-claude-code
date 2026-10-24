# Compliance: the rules this system checks

`/compliance` (or `npm run mx -- compliance`) checks the records against the rules below and reports every breach with the rule and its source. The rules are written for a New Zealand operator under the Civil Aviation Rules, because that is where this was first built. An Australian operator changes the sources here to the CASA equivalents (CASR Part 39 for directives, Part 42 or Part 43 for continuing airworthiness and maintenance, Part 66 for licences, and the maintenance release) and changes the checks in `scripts/mx.mjs` (`complianceRows`) in the same edit.

This is a records check. It finds what the records say happened. It is not legal advice, and it does not replace your engineers, your maintenance programme, your exposition or the Civil Aviation Authority. Confirm each rule against the current version of its source at [aviation.govt.nz/rules](https://www.aviation.govt.nz/rules/) before you rely on it, and when a rule or your programme changes, change the rule here and the check in the same edit.

| Rule | What a breach looks like in the data | Source |
|---|---|---|
| R1 Every directive assessed | An airworthiness directive on the register for an aircraft's type with no assessment recorded for that aircraft | Civil Aviation Rules Part 39, Airworthiness Directives |
| R2 Nothing flown past due | A programme item past its hours or cycles, or flown after its due date; or a directive not complied with after its compliance window, measured from the tech log | Part 91 Subpart G (maintenance of the aircraft to its programme) and Part 39 |
| R3 No life-limited part past its limit | A fitted part whose own hours, cycles or calendar life since new is past its limit | Part 91 Subpart G; the airworthiness limitations section of the manufacturer's maintenance manual |
| R4 Review of airworthiness in date | An aircraft's review of airworthiness past its due date | Part 91 Subpart G, review of airworthiness |
| R5 Released by an authorised engineer | A work order released by an engineer whose licence had lapsed that day, who holds no rating for the type, or a review of airworthiness signed without an inspection authorisation | Part 43 (release to service) and Part 66 (aircraft maintenance personnel licensing) |
| R6 No flight with work not released | Tasks done on an open work order, and the aircraft flown after the work was done | Part 43, release to service after maintenance |
| R7 Deferred defects inside their limit | A deferred defect past the limit of the MEL item or deferral it was deferred under | Part 91 rules on inoperative equipment, and your approved minimum equipment list |
| R8 Release certificate for every fitted part | A fitted component with no release certificate (CAA Form One, EASA Form 1 or equivalent) on file | Part 43 (acceptance of parts) and your maintenance records |
| R9 No flight with an open defect | A defect neither rectified nor deferred, and the aircraft flown after it was raised | Part 91, the aircraft is airworthy before flight |

## Why each one matters

- **R1 and R2.** A new directive often gives a short window in hours. The tech log already says how many hours each aircraft has flown since the effective date, so the check counts them. This is the work an analyst does by hand every week.
- **R3.** Life-limited parts are tracked on the part, not the aircraft. A part moved between aircraft carries its hours and cycles with it (`remove` saves them, `install` restarts the count on the new aircraft).
- **R4.** The review is booked weeks ahead with an engineer who holds the authorisation. `/attention` flags it 30 days out.
- **R5 and R6.** A release is only as good as the person who signed it. `certify` refuses a release by an engineer without a current licence or the type rating; the check finds any that got through another way (a record imported, or a licence date corrected later).
- **R7 and R9.** An open defect grounds the aircraft until it is deferred against the MEL or fixed. The tech log shows whether it flew anyway.
- **R8.** A part without its release certificate is a part you cannot show is airworthy.

## Not checked here

- Weight and balance, the flight manual supplement list and equipment fitted for the operation (night, IFR, external load) are not in the base. They are a `/customise` away if you keep those records.
- Duty and flight time limits for pilots are crew rostering, not maintenance. Commercial terms with an aircraft owner are in `/attention` notes, not here.
- Tolerances on inspection intervals (some programmes allow 10 percent) are not applied. Add yours with `/customise` if your programme allows them.
