import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Study-specific fixture preparation, not a reusable evaluation framework.
// Never installs skills, invokes an agent, or edits an existing fixture run.
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../..');
const condition = process.argv[2];
if (!['assignment', 'candidate'].includes(condition)) {
  throw new Error('Choose assignment or candidate.');
}
const cases = JSON.parse(fs.readFileSync(path.join(here, 'evaluation-cases.json'), 'utf8')).cases;
const baseline = JSON.parse(fs.readFileSync(path.join(here, 'baseline.json'), 'utf8'));
const manifestPath = path.join(here, 'execution-manifest.json');
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : {
      createdAt: new Date().toISOString(),
      root: fs.mkdtempSync(path.join(os.tmpdir(), 'skills-wave1-quality-')),
      node: process.version,
      model: 'Inherited; exact identifier not exposed by delegation tool',
      isolation: 'Separate directories; access restriction is procedural',
      runs: [],
    };
if (manifest.runs.some((run) => run.condition === condition)) {
  throw new Error('This condition already has prepared runs; refusing overwrite.');
}
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const write = (root, relative, content) => {
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
};
function collect(root, directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collect(root, target)
      : [
          {
            path: path.relative(root, target).replaceAll('\\', '/'),
            sha256: hash(fs.readFileSync(target)),
          },
        ];
  });
}
function runNode(project, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: project,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  });
  if (result.error) throw result.error;
  return {
    command: ['node', ...args],
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    executedAt: new Date().toISOString(),
  };
}
for (const [index, studyCase] of cases.entries()) {
  const id = 'run' + String(index * 2 + (condition === 'assignment' ? 1 : 2)).padStart(2, '0');
  const runRoot = path.join(manifest.root, id);
  if (fs.existsSync(runRoot)) throw new Error('Existing run: ' + runRoot);
  const project = path.join(runRoot, 'project');
  const skillRoot = path.join(runRoot, 'skills');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(runRoot, 'output'));
  for (const [name, contents] of Object.entries(studyCase.files)) {
    write(project, name, contents);
  }
  const preparation = [];
  if (studyCase.id === 'stale-build') {
    preparation.push(runNode(project, ['build.mjs']));
    preparation.push(runNode(project, ['--test', 'test/window.test.mjs']));
    if (preparation.some((result) => result.status !== 0)) {
      throw new Error('Baseline fixture failed: ' + JSON.stringify(preparation));
    }
    write(
      project,
      'evidence/previous-run.json',
      JSON.stringify(
        {
          inputs: collect(project),
          executions: preparation,
        },
        null,
        2,
      ) + '\n',
    );
    write(
      project,
      'handoff.md',
      '# Handoff\nThe named-boolean refactor was prepared after the recorded check. ' +
        'Evidence: evidence/previous-run.json. Finish verification of the current checkout. ' +
        'The README editorial note belongs to another contributor.\n',
    );
    const source = path.join(project, 'src/window.js');
    fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace('at < end', 'at <= end'));
  } else if (studyCase.id === 'readiness-evidence') {
    preparation.push(
      runNode(project, ['--test', '--test-reporter=tap', 'test/saved-filters.test.mjs']),
    );
    if (preparation[0].status !== 0 || !preparation[0].stdout.includes('SKIP')) {
      throw new Error('Expected successful fixture with a skipped test.');
    }
    write(
      project,
      'validation/run.txt',
      'Candidate c7; Node test runner; in-memory store.\n' +
        preparation[0].stdout +
        preparation[0].stderr +
        '\nExit: ' +
        preparation[0].status +
        '\n',
    );
  }
  // Provide the full catalog in both conditions; restore the 29 original packages
  // from the assignment snapshot instead of mixing revisions inside a package.
  const selected = new Map(baseline.skills.map((skill) => [skill.name, skill]));
  for (const entry of fs.readdirSync(path.join(repository, 'skills'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const original = selected.get(entry.name);
    if (condition === 'assignment' && original) {
      for (const [name, file] of Object.entries(original.files)) {
        write(runRoot, name, file.content);
      }
    } else {
      fs.cpSync(path.join(repository, 'skills', entry.name), path.join(skillRoot, entry.name), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }
  }
  write(runRoot, 'task.md', studyCase.task + '\n');
  manifest.runs.push({
    id,
    condition,
    case: studyCase.id,
    primary: studyCase.primary,
    root: runRoot,
    project,
    preparedAt: new Date().toISOString(),
    projectBefore: collect(project),
    skillSnapshot: collect(skillRoot),
    preparation,
    status: 'prepared',
  });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ id, case: studyCase.id, condition, root: runRoot }));
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
