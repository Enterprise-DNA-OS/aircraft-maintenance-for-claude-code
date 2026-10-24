#!/usr/bin/env node
// Loads supabase/seed.sql: Southern Lakes Aviation Ltd, a fictional Queenstown helicopter and
// charter operator with five aircraft, 45 days of tech log, the maintenance programme,
// components, directives, defects, work orders and engineers. Dates are relative to today and
// every insert skips what is already there, so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  await db.exec(readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8'));
  const [c] = await db.query(`
    select (select count(*) from aircraft) as aircraft, (select count(*) from flights) as flights,
           (select count(*) from maintenance_items) as items, (select count(*) from components) as components,
           (select count(*) from directives) as directives, (select count(*) from defects) as defects,
           (select count(*) from work_orders) as work_orders, (select count(*) from engineers) as engineers`);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(`seed: ${n.aircraft} aircraft, ${n.flights} tech log entries, ${n.items} programme items, ${n.components} components, ${n.directives} directives, ${n.defects} defects, ${n.work_orders} work orders, ${n.engineers} engineers`);
  } finally {
    await db.close();
  }
}
