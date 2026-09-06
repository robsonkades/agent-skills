import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('./check-governance-register.mjs', import.meta.url));
const manual = {
  characteristic: 'deployability',
  governance: 'M',
  metric: 'failed changes',
  criterion: 'review failed changes',
  cadence: 'monthly',
  lastVerdict: '2026-08-04',
  consequence: 'owner triages violations',
  owner: 'platform lead',
  review: '2027-02-01',
};
const register = (entry = manual) => ({ entries: [entry] });
function run(value, args = ['--today=2026-09-05'], raw = false) {
  const dir = mkdtempSync(join(tmpdir(), 'fitness-register-'));
  try {
    const path = join(dir, 'register.json');
    writeFileSync(path, raw ? value : JSON.stringify(value));
    const result = spawnSync(process.execPath, [checker, path, ...args], { encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('monthly grace boundary passes as metadata, not proof of execution', () => {
  const result = run(register());
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Execution and coverage are not verified/);
  assert.equal(run(register({ ...manual, lastVerdict: '2026-08-03' })).status, 1);
});

for (const [name, value, status, message] of [
  ['null root', null, 2, /entries/],
  ['array root', [], 2, /entries/],
  ['empty register', { entries: [] }, 1, /no entries/],
  ['null entry', register(null), 1, /must be an object/],
  ['array entry', register([]), 1, /must be an object/],
  ['unnamed entry', register({ ...manual, characteristic: '' }), 1, /characteristic name/],
  [
    'hostile name object',
    register({ ...manual, characteristic: { toString: null } }),
    1,
    /characteristic name/,
  ],
  ['blank owner', register({ ...manual, owner: '  ' }), 1, /owner/],
  ['object metric', register({ ...manual, metric: {} }), 1, /metric/],
  ['missing consequence', register({ ...manual, consequence: null }), 1, /consequence/],
  ['impossible review', register({ ...manual, review: '2027-02-30' }), 1, /review date/],
  ['expired review', register({ ...manual, review: '2026-09-04' }), 1, /has passed/],
  ['future verdict', register({ ...manual, lastVerdict: '2026-09-06' }), 1, /future/],
  ['missing verdict', register({ ...manual, lastVerdict: undefined }), 1, /lastVerdict/],
  ['impossible verdict', register({ ...manual, lastVerdict: '2026-02-30' }), 1, /lastVerdict/],
  ['prototype cadence', register({ ...manual, cadence: 'toString' }), 1, /unrecognised cadence/],
  ['unknown mode', register({ ...manual, governance: 'X' }), 1, /governance/],
  ['future reviewed', { ...register(), reviewed: '2026-09-06' }, 1, /reviewed/],
  ['invalid reviewed', { ...register(), reviewed: '2026-02-30' }, 1, /reviewed/],
  ['stale reviewed', { ...register(), reviewed: '2025-01-01' }, 1, /367-day/],
]) {
  test(name, () => {
    const result = run(value);
    assert.equal(result.status, status, result.output);
    assert.match(result.output, message);
    assert.doesNotMatch(result.output, /TypeError|RangeError/);
    assert.doesNotMatch(result.output, /never actually run|nothing is governed/);
  });
}

test('automated and uncovered entries validate their distinct required fields', () => {
  const automated = { ...manual, governance: 'T', threshold: 'zero new violations', site: 'PR' };
  const uncovered = {
    characteristic: 'semantic drift',
    governance: 'none',
    risk: 'not inspected',
    owner: 'lead',
    review: '2027-02-01',
  };
  assert.equal(
    run({ entries: [automated, { ...automated, governance: 'C' }, uncovered] }).status,
    0,
  );
  for (const field of ['threshold', 'site']) {
    assert.equal(run(register({ ...automated, [field]: [] })).status, 1);
  }
  assert.equal(run(register({ ...uncovered, risk: true })).status, 1);
});

test('invalid invocation and invalid JSON return exit 2', () => {
  for (const args of [
    ['--today=2026-02-30'],
    ['--today=2026-13-01'],
    ['--unknown'],
    ['--today=2026-09-05', '--today=2026-09-06'],
    ['extra.json'],
  ])
    assert.equal(run(register(), args).status, 2);
  assert.equal(run('{', [], true).status, 2);
  assert.equal(run(register(), ['--today=2028-02-29']).status, 1); // valid leap date, expired entry
});

test('documented register is valid at its stated example date', () => {
  const doc = readFileSync(new URL('../references/ungoverned.md', import.meta.url), 'utf8');
  for (const lineEnding of ['\n', '\r\n']) {
    const normalized = doc.replace(/\r?\n/g, lineEnding);
    const json = normalized.match(/```json\r?\n([\s\S]*?)\r?\n```/)[1];
    const result = run(JSON.parse(json));
    assert.equal(result.status, 0, result.output);
  }
});

test('UTC review deadlines are inclusive and elapsed-age limits have explicit boundaries', () => {
  assert.equal(run(register({ ...manual, review: '2026-09-05' })).status, 0);
  assert.equal(run({ ...register(), reviewed: '2025-09-03' }).status, 0);
  assert.equal(run({ ...register(), reviewed: '2025-09-02' }).status, 1);
});
