#!/usr/bin/env node
// Governance register check — the ungoverned declaration made executable.
//
//   node check-governance-register.mjs <register.json> [--today=YYYY-MM-DD]
//
// Exit 0 = every characteristic is either governed with a consequence, or ungoverned on the record
// with a live owner and review date. Exit 1 = at least one entry claims governance it does not have.
// Exit 2 = the register itself could not be read.
//
// This is a temporal fitness function: nothing here changes when code changes, so only a clock
// catches it. Run it nightly, not on a pull request. Schema: references/ungoverned.md.
// No dependencies, by design — a check that needs an install is a check that gets skipped.

import fs from 'node:fs';

const MODES = ['T', 'C', 'M', 'none'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const todayArg = args.find((a) => a.startsWith('--today='));
const today = todayArg ? todayArg.slice('--today='.length) : new Date().toISOString().slice(0, 10);

if (!path) {
  process.stderr.write(
    'usage: check-governance-register.mjs <register.json> [--today=YYYY-MM-DD]\n',
  );
  process.exit(2);
}
if (!DATE.test(today)) {
  process.stderr.write(`--today must be YYYY-MM-DD, got ${today}\n`);
  process.exit(2);
}

let register;
try {
  register = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (err) {
  process.stderr.write(`cannot read register ${path}: ${err.message}\n`);
  process.exit(2);
}

const failures = [];
const fail = (name, msg) => failures.push(`${name}: ${msg}`);

/** Print problems and exit 1. Never called with an empty list. */
function report(list) {
  process.stdout.write(`${path}: ${list.length} problem(s)\n`);
  for (const f of list) process.stdout.write(`  - ${f}\n`);
  process.exit(1);
}

/** Whole days between two ISO dates. Days, not months, so that weekly is not rounded to monthly. */
function daysBetween(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// One period plus the slack a real calendar needs. An unrecognised cadence is deliberately NOT
// given a default here — see the lapse check below.
const CADENCE_DAYS = {
  weekly: 8,
  fortnightly: 15,
  monthly: 32,
  quarterly: 94,
  'half-yearly': 185,
  annually: 367,
};

const entries = Array.isArray(register.entries) ? register.entries : null;
if (entries && entries.length === 0) {
  // An empty register is not a governed system; it is an unstarted one. Reporting green here would
  // be this skill's own archetype: a check that cannot fail on the input it was given.
  report([
    "register: no entries — nothing is governed and nothing is declared ungoverned. An empty register is an unstarted one: begin from the quantum's driving characteristics.",
  ]);
}
if (!entries) {
  process.stderr.write(`register ${path} has no "entries" array\n`);
  process.exit(2);
}

for (const [i, e] of entries.entries()) {
  const name = e.characteristic || `entry #${i + 1}`;

  if (!MODES.includes(e.governance)) {
    fail(
      name,
      `governance must be one of ${MODES.join(', ')} — found ${JSON.stringify(e.governance)}`,
    );
    continue;
  }

  // Every entry, governed or not, has an accountable person and a live review date.
  if (!e.owner) fail(name, 'no owner');
  if (!DATE.test(e.review || '')) fail(name, 'no review date (YYYY-MM-DD)');
  else if (e.review < today) fail(name, `review date ${e.review} has passed`);

  if (e.governance === 'none') {
    // Ungoverned is a decision, not an omission: it has to say what is exposed.
    if (!e.risk) fail(name, 'declared ungoverned with no "risk" sentence naming what is exposed');
    continue;
  }

  if (!e.metric) fail(name, 'governed with no metric');
  if (!e.consequence) fail(name, 'governed with no consequence — a metric, not a fitness function');

  if (e.governance === 'M') {
    if (!e.criterion)
      fail(name, 'manual with no written criterion — the verdict is then an opinion');
    if (!e.cadence) fail(name, 'manual with no cadence');
    if (!DATE.test(e.lastVerdict || '')) {
      fail(name, 'manual with no recorded lastVerdict — it has never actually run');
    } else if (e.cadence) {
      const allowed = CADENCE_DAYS[e.cadence];
      if (allowed === undefined) {
        // A cadence the checker cannot read is a cadence it cannot check. Passing here would ship
        // the failBuildOnCVSS defect into this file: green because nothing was ever evaluated.
        fail(
          name,
          `unrecognised cadence ${JSON.stringify(e.cadence)} — the lapse check cannot run, so it ` +
            `would silently pass. Use one of: ${Object.keys(CADENCE_DAYS).join(', ')}`,
        );
      } else if (daysBetween(e.lastVerdict, today) > allowed) {
        fail(name, `manual verdict last recorded ${e.lastVerdict}, past its ${e.cadence} cadence`);
      }
    }
  } else {
    if (!e.threshold) fail(name, 'governed with no threshold — a metric alone is a dashboard');
    if (!e.site) fail(name, 'governed with no site — nowhere for it to run');
  }
}

if (
  register.reviewed &&
  DATE.test(register.reviewed) &&
  daysBetween(register.reviewed, today) > 367
) {
  failures.push(
    `register: last reviewed ${register.reviewed} — BEA ch. 2 asks for a review at least once a year`,
  );
}

const governed = entries.filter(
  (e) => MODES.includes(e.governance) && e.governance !== 'none',
).length;
const ungoverned = entries.filter((e) => e.governance === 'none').length;

if (failures.length === 0) {
  process.stdout.write(
    `${path}: OK — ${entries.length} characteristic(s): ${governed} governed, ${ungoverned} ungoverned on the record.\n`,
  );
  process.exit(0);
}

report(failures);
