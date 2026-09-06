#!/usr/bin/env node
// Governance register check — the ungoverned declaration made executable.
//
//   node check-governance-register.mjs <register.json> [--today=YYYY-MM-DD]
//
// Exit 0 = metadata passes the checks below; this does not prove controls actually run.
// Exit 1 = invalid/stale entry metadata. Exit 2 = invalid invocation or unreadable/root-invalid input.
//
// Run on register changes and on a schedule to detect elapsed review dates.
// Schema: references/ungoverned.md. Uses Node built-ins only.

import fs from 'node:fs';

const MODES = ['T', 'C', 'M', 'none'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const todayArg = args.find((a) => a.startsWith('--today='));
const today = todayArg ? todayArg.slice('--today='.length) : new Date().toISOString().slice(0, 10);

if (
  !path ||
  args.filter((a) => !a.startsWith('--')).length !== 1 ||
  args.filter((a) => a.startsWith('--today=')).length > 1 ||
  args.some((a) => a.startsWith('--') && !a.startsWith('--today='))
) {
  process.stderr.write(
    'usage: check-governance-register.mjs <register.json> [--today=YYYY-MM-DD]\n',
  );
  process.exit(2);
}
if (!validDate(today)) {
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
  return (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000;
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

const entries = object(register) && Array.isArray(register.entries) ? register.entries : null;
if (entries && entries.length === 0) {
  // With no records there is no metadata to assess; actual governance may exist elsewhere.
  report([
    'register: no entries — no control or uncovered-risk metadata to assess; populate the register from the agreed scope and characteristics.',
  ]);
}
if (!entries) {
  process.stderr.write(`register ${path} has no "entries" array\n`);
  process.exit(2);
}

for (const [i, e] of entries.entries()) {
  if (!object(e)) {
    fail(`entry #${i + 1}`, 'must be an object');
    continue;
  }
  const name = text(e.characteristic) ? e.characteristic : `entry #${i + 1}`;
  if (!text(e.characteristic)) fail(`entry #${i + 1}`, 'no characteristic name');

  if (!MODES.includes(e.governance)) {
    fail(
      name,
      `governance must be one of ${MODES.join(', ')} — found ${JSON.stringify(e.governance)}`,
    );
    continue;
  }

  // Every entry, governed or not, has an accountable person and a live review date.
  if (!text(e.owner)) fail(name, 'no owner (nonblank string required)');
  if (!validDate(e.review)) fail(name, 'invalid review date (real YYYY-MM-DD required)');
  else if (e.review < today) fail(name, `review date ${e.review} has passed`);

  if (e.governance === 'none') {
    // Ungoverned is a decision, not an omission: it has to say what is exposed.
    if (!text(e.risk))
      fail(name, 'declared ungoverned with no "risk" sentence naming what is exposed');
    continue;
  }

  if (!text(e.metric)) fail(name, 'governed with no metric');
  if (!text(e.consequence)) fail(name, 'governed with no consequence');

  if (e.governance === 'M') {
    if (!text(e.criterion))
      fail(name, 'manual with no written criterion — the verdict is then an opinion');
    if (!text(e.cadence)) fail(name, 'manual with no cadence');
    if (!validDate(e.lastVerdict)) {
      fail(
        name,
        'manual lastVerdict is missing or invalid — a real recorded review date is required',
      );
    } else if (e.lastVerdict > today) {
      fail(name, 'manual lastVerdict is in the future');
    } else if (text(e.cadence)) {
      const allowed = Object.hasOwn(CADENCE_DAYS, e.cadence) ? CADENCE_DAYS[e.cadence] : undefined;
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
    if (!text(e.threshold)) fail(name, 'governed with no threshold');
    if (!text(e.site)) fail(name, 'governed with no site — nowhere for it to run');
  }
}

if (register.reviewed !== undefined) {
  if (!validDate(register.reviewed) || register.reviewed > today) {
    failures.push('register: reviewed must be a real date no later than today');
  } else if (daysBetween(register.reviewed, today) > 367) {
    failures.push(
      `register: last reviewed ${register.reviewed}, beyond the 367-day register policy`,
    );
  }
}

const governed = entries.filter(
  (e) => object(e) && MODES.includes(e.governance) && e.governance !== 'none',
).length;
const ungoverned = entries.filter((e) => object(e) && e.governance === 'none').length;

if (failures.length === 0) {
  process.stdout.write(
    `${path}: metadata OK — ${entries.length} entry(s): ${governed} control record(s), ${ungoverned} uncovered risk record(s). Execution and coverage are not verified.\n`,
  );
  process.exit(0);
}

report(failures);
