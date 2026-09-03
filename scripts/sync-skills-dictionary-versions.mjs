import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const skillsRoot = join(root, 'skills');
const dictionaryPath = join(root, 'SKILLS.md');
const versions = new Map(
  readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifest = readFileSync(join(skillsRoot, entry.name, 'skill.yaml'), 'utf8');
      const version = manifest.match(/^version:\s*(\d+\.\d+\.\d+)$/m)?.[1];
      if (!version) throw new Error(`Missing version for ${entry.name}`);
      return [entry.name, version];
    }),
);

let seen = 0;
const current = readFileSync(dictionaryPath, 'utf8');
const updated = current.replace(/^#### `([^`]+)`[^\r\n]*?v\d+\.\d+\.\d+\s*$/gm, (line, name) => {
  const version = versions.get(name);
  if (!version) throw new Error(`Dictionary contains unknown skill ${name}`);
  seen += 1;
  return line.replace(/v\d+\.\d+\.\d+\s*$/, `v${version}`);
});

if (seen !== versions.size) {
  throw new Error(`Dictionary has ${seen} versioned skills; manifests have ${versions.size}`);
}

writeFileSync(dictionaryPath, updated);
console.log(`Synchronized ${seen} SKILLS.md version headings.`);
