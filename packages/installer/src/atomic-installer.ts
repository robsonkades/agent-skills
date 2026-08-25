import {
  AgentSkillsError,
  ErrorCode,
  RECEIPT_DIRNAME,
  classifyChange,
  entryNameFor,
  parseReceipt,
  posix,
  receiptPath,
  stringifyReceipt,
  type AgentTarget,
  type Clock,
  type FileSystem,
  type Hasher,
  type InstallReceipt,
  type InstallRequest,
  type InstallResult,
  type InstallationEngine,
  type InstalledSkill,
  type LayoutEntry,
  type Logger,
  type ReceiptFile,
  type UninstallRequest,
  type UninstallResult,
} from '@jvm-expert/core';
import { assertContained, safeRelativePath } from './safe-path.ts';

const STAGING_PREFIX = '.agent-skills-staging-';
const RETIRED_PREFIX = '.agent-skills-retired-';

export interface AtomicInstallerOptions {
  readonly fs: FileSystem;
  readonly hasher: Hasher;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Recorded in receipts, e.g. `@jvm-expert/agent-skills@1.0.0`. */
  readonly toolVersion: string;
}

/**
 * The only component in the system that writes into an agent's skill directory.
 *
 * Concentrating writes here is what makes the security and atomicity guarantees checkable:
 * every adapter, present and future, gets the same hardened commit path for free, and the
 * adversarial tests only have to cover one implementation.
 *
 * Commit sequence (ARCHITECTURE.md §5):
 *
 *   1. stage into `<root>/.agent-skills-staging-xxxx` — same filesystem as the target, so
 *      the final move is a rename and not a copy
 *   2. move any existing install aside to `<root>/.agent-skills-retired-xxxx`
 *   3. rename staging into place
 *   4. delete the retired copy
 *
 * A crash at any step leaves either the old version or the new one intact. Step 2 is undone
 * if step 3 fails, so a failed install never destroys a working skill.
 */
export class AtomicInstaller implements InstallationEngine {
  private readonly fs: FileSystem;
  private readonly hasher: Hasher;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly toolVersion: string;

  constructor(options: AtomicInstallerOptions) {
    this.fs = options.fs;
    this.hasher = options.hasher;
    this.clock = options.clock;
    this.logger = options.logger;
    this.toolVersion = options.toolVersion;
  }

  async install(request: InstallRequest): Promise<InstallResult> {
    const { adapter, target, pkg } = request;
    const layout = adapter.layoutFor(pkg);
    const entryName = safeRelativePath(
      entryNameFor(target, pkg.manifest.name),
      `${adapter.id} layout`,
    );
    const destination = this.fs.join(target.root, entryName);

    const previous = await this.read(target, pkg.manifest.name);
    if (previous !== undefined && previous.unmanaged && !request.force) {
      throw new AgentSkillsError(
        ErrorCode.MODIFIED_INSTALL,
        `${destination} already exists and was not installed by agent-skills`,
        {
          details: ['Overwriting it would destroy content this tool does not own.'],
          hints: [`agent-skills install ${pkg.manifest.name} --force   to replace it anyway`],
          data: { name: pkg.manifest.name, directory: destination },
        },
      );
    }
    if (previous !== undefined && previous.modified && !request.force) {
      throw new AgentSkillsError(
        ErrorCode.MODIFIED_INSTALL,
        `${pkg.manifest.name} has local modifications in ${destination}`,
        {
          details: ['Files have changed since they were installed.'],
          hints: [`agent-skills install ${pkg.manifest.name} --force   to discard the changes`],
          data: { name: pkg.manifest.name, directory: destination },
        },
      );
    }

    // File-shaped installs record their one file relative to the root, because there is no
    // package directory for it to be relative to.
    const files =
      target.shape === 'file'
        ? this.planSingleFile(layout.entries, pkg, entryName, adapter.id)
        : this.planFiles(layout.entries, pkg, destination);
    const outcome = decideOutcome(previous, request);

    if (request.dryRun) {
      return this.result(
        request,
        destination,
        files,
        previous,
        outcome,
        this.buildReceipt(request, destination, files),
      );
    }

    await this.fs.mkdirp(target.root);
    const staging = await this.fs.makeTempDir(target.root, STAGING_PREFIX);

    try {
      for (const file of files) {
        const absolute = this.fs.join(staging, ...file.path.split('/'));
        assertContained(staging, this.fs.resolve(absolute), this.fs.separator);
        await this.fs.mkdirp(this.fs.dirname(absolute));
        // Written without an executable bit: `scripts/` ships as data, and this installer
        // never runs anything a package contains.
        await this.fs.writeFile(absolute, file.bytes);
      }

      const receipt = this.buildReceipt(request, destination, files);
      if (target.shape === 'directory') {
        await this.fs.writeFile(
          this.fs.join(staging, RECEIPT_DIRNAME, 'receipt.json'),
          stringifyReceipt(receipt),
        );
      }

      // Both shapes commit by rename: a directory moves as a whole, a single file replaces
      // the previous one, and the staging directory is left empty behind it.
      await this.commit(
        target.shape === 'file' ? this.fs.join(staging, entryName) : staging,
        destination,
        target.root,
      );
      if (target.shape === 'file') await this.fs.remove(staging).catch(() => undefined);
      await this.writeRootReceipt(target, receipt);

      return this.result(request, destination, files, previous, outcome, receipt);
    } catch (error) {
      await this.fs.remove(staging).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Swap the staged directory into place, keeping the previous install recoverable until the
   * new one is committed.
   */
  private async commit(staging: string, destination: string, root: string): Promise<void> {
    const exists = await this.fs.exists(destination);
    let retired: string | undefined;

    if (exists) {
      retired = this.fs.join(root, `${RETIRED_PREFIX}${Date.now().toString(36)}`);
      await this.fs.rename(destination, retired);
    }

    try {
      await this.fs.rename(staging, destination);
    } catch (error) {
      // Put the old version back before surfacing the failure: the invariant is that a failed
      // install leaves the existing version untouched.
      if (retired !== undefined) {
        await this.fs.rename(retired, destination).catch(() => {
          this.logger.error(
            `Install failed and the previous version could not be restored. It is preserved at ${retired}`,
          );
        });
      }
      throw error;
    }

    if (retired !== undefined) await this.fs.remove(retired).catch(() => undefined);
  }

  /**
   * A `file`-shaped layout must project to exactly one file; the installer names it, so the
   * entry's own path is not used.
   */
  private planSingleFile(
    entries: readonly LayoutEntry[],
    pkg: InstallRequest['pkg'],
    entryName: string,
    agentId: string,
  ): readonly { path: string; bytes: Uint8Array }[] {
    if (entries.length !== 1) {
      throw new AgentSkillsError(
        ErrorCode.INTERNAL,
        `Adapter "${agentId}" projected ${entries.length} files onto a single-file target`,
        { data: { agentId, entries: entries.length } },
      );
    }
    const entry = entries[0]!;
    let bytes: Uint8Array;
    if (entry.content !== undefined) {
      bytes = entry.content;
    } else {
      const source = pkg.files.find((file) => file.path === posix.normalize(entry.copyFrom));
      if (source === undefined) {
        throw new AgentSkillsError(
          ErrorCode.INTERNAL,
          `Adapter asked to copy "${entry.copyFrom}", which is not in the package`,
          { data: { path: entry.copyFrom } },
        );
      }
      bytes = source.bytes;
    }
    return [{ path: entryName, bytes }];
  }

  private planFiles(
    entries: readonly LayoutEntry[],
    pkg: InstallRequest['pkg'],
    destination: string,
  ): readonly { path: string; bytes: Uint8Array }[] {
    const planned = new Map<string, { path: string; bytes: Uint8Array }>();

    for (const entry of entries) {
      const relative = safeRelativePath(entry.path, destination);

      if (posix.segments(relative)[0] === RECEIPT_DIRNAME) {
        throw new AgentSkillsError(
          ErrorCode.UNSAFE_PATH,
          `A package may not write into ${RECEIPT_DIRNAME}/`,
          {
            details: [`Offending path: ${entry.path}`, 'That directory holds install bookkeeping.'],
            data: { path: entry.path },
          },
        );
      }

      let bytes: Uint8Array;
      if (entry.content !== undefined) {
        bytes = entry.content;
      } else {
        const source = pkg.files.find((file) => file.path === posix.normalize(entry.copyFrom));
        if (source === undefined) {
          throw new AgentSkillsError(
            ErrorCode.INTERNAL,
            `Adapter asked to copy "${entry.copyFrom}", which is not in the package`,
            { data: { path: entry.copyFrom } },
          );
        }
        bytes = source.bytes;
      }

      planned.set(relative, { path: relative, bytes });
    }

    return [...planned.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  private buildReceipt(
    request: InstallRequest,
    destination: string,
    files: readonly { path: string; bytes: Uint8Array }[],
  ): InstallReceipt {
    return {
      receiptVersion: 1,
      name: request.pkg.manifest.name,
      version: request.pkg.manifest.version,
      agentId: request.target.agentId,
      scope: request.target.scope,
      registry: request.registry,
      resolved: request.resolved,
      integrity: request.integrity,
      installedAt: this.clock.now().toISOString(),
      installedWith: this.toolVersion,
      directory: destination,
      files: files.map((file): ReceiptFile => ({
        path: file.path,
        integrity: this.hasher.hash(file.bytes),
        size: file.bytes.byteLength,
      })),
      dependencyOf: request.dependencyOf,
    };
  }

  /**
   * A second copy of the receipt lives in the skill root rather than only inside the skill
   * directory, so `list` and `doctor` can enumerate installs with one directory read instead
   * of descending into every skill.
   */
  private async writeRootReceipt(target: AgentTarget, receipt: InstallReceipt): Promise<void> {
    const path = this.fs.join(target.root, ...receiptPath(receipt.name).split('/'));
    await this.fs.mkdirp(this.fs.dirname(path));
    await this.fs.writeFile(path, stringifyReceipt(receipt));
  }

  private result(
    request: InstallRequest,
    destination: string,
    files: readonly { path: string }[],
    previous: InstalledSkill | undefined,
    outcome: InstallResult['outcome'],
    receipt: InstallReceipt,
  ): InstallResult {
    return {
      outcome,
      name: request.pkg.manifest.name,
      version: request.pkg.manifest.version,
      ...(previous === undefined ? {} : { previousVersion: previous.version }),
      agentId: request.target.agentId,
      scope: request.target.scope,
      directory: destination,
      files: files.map((file) => file.path),
      receipt,
    };
  }

  async uninstall(request: UninstallRequest): Promise<UninstallResult> {
    const { target, name } = request;
    const installed = await this.read(target, name);

    if (installed === undefined) {
      throw new AgentSkillsError(
        ErrorCode.NOT_INSTALLED,
        `"${name}" is not installed for ${target.agentId}`,
        {
          data: { name, agentId: target.agentId, root: target.root },
        },
      );
    }
    if (installed.unmanaged) {
      throw new AgentSkillsError(
        ErrorCode.MODIFIED_INSTALL,
        `${installed.directory} was not installed by agent-skills`,
        {
          details: ['Refusing to delete files this tool does not own.'],
          hints: ['Remove the directory manually if you are sure'],
          data: { name, directory: installed.directory },
        },
      );
    }

    const receipt = await this.readReceipt(target, name);
    const removed: string[] = [];
    const preserved: string[] = [];
    const base = this.baseFor(target, installed.directory);

    for (const file of receipt?.files ?? []) {
      const absolute = this.fs.join(base, ...file.path.split('/'));
      if (!(await this.fs.exists(absolute))) continue;

      // Only delete what still matches what we wrote. Anything the user edited is theirs.
      const current = await this.hasher.hashFile(absolute).catch(() => undefined);
      if (current !== file.integrity && !request.force) {
        preserved.push(file.path);
        continue;
      }
      if (!request.dryRun) await this.fs.remove(absolute);
      removed.push(file.path);
    }

    if (!request.dryRun) {
      await this.fs
        .remove(this.fs.join(target.root, ...receiptPath(name).split('/')))
        .catch(() => undefined);
      if (target.shape === 'directory') {
        await this.fs
          .remove(this.fs.join(installed.directory, RECEIPT_DIRNAME))
          .catch(() => undefined);
        // Prune only what is now empty. A blanket delete of the skill directory would take
        // files the user added after installation, which the receipt never claimed.
        await this.pruneEmptyDirectories(installed.directory);
      }
    }

    return {
      name,
      ...(receipt === undefined ? {} : { version: receipt.version }),
      agentId: target.agentId,
      scope: target.scope,
      directory: installed.directory,
      removed: removed.sort(),
      preserved: preserved.sort(),
    };
  }

  /**
   * Depth-first removal of directories that became empty, stopping at the first that did not.
   * Returns true when `directory` itself was removed.
   */
  private async pruneEmptyDirectories(directory: string): Promise<boolean> {
    if (!(await this.fs.exists(directory))) return true;

    let entries;
    try {
      entries = await this.fs.readDir(directory);
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      await this.pruneEmptyDirectories(this.fs.join(directory, entry.name));
    }

    const remaining = await this.fs.readDir(directory).catch(() => [{ name: 'unknown' } as never]);
    if (remaining.length > 0) return false;

    await this.fs.remove(directory).catch(() => undefined);
    return true;
  }

  async list(target: AgentTarget): Promise<readonly InstalledSkill[]> {
    if (!(await this.fs.exists(target.root))) return [];

    const skills: InstalledSkill[] = [];
    for (const entry of await this.fs.readDir(target.root)) {
      if (entry.name.startsWith('.')) continue; // .agent-skills, staging and retired leftovers

      const name = this.nameOf(target, entry.name, entry.isDirectory);
      if (name === undefined) continue;

      const skill = await this.describe(target, name);
      if (skill !== undefined) skills.push(skill);
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The package name a root entry stands for, or undefined when it is not one. */
  private nameOf(target: AgentTarget, entryName: string, isDirectory: boolean): string | undefined {
    if (target.shape === 'directory') return isDirectory ? entryName : undefined;
    if (isDirectory || !entryName.endsWith(target.extension)) return undefined;
    return entryName.slice(0, entryName.length - target.extension.length);
  }

  /** Where the receipt's file paths are relative to: the package directory, or the root. */
  private baseFor(target: AgentTarget, destination: string): string {
    return target.shape === 'file' ? target.root : destination;
  }

  async read(target: AgentTarget, name: string): Promise<InstalledSkill | undefined> {
    const directory = this.fs.join(target.root, entryNameFor(target, name));
    if (!(await this.fs.exists(directory))) return undefined;
    return this.describe(target, name);
  }

  private async describe(target: AgentTarget, name: string): Promise<InstalledSkill | undefined> {
    const directory = this.fs.join(target.root, entryNameFor(target, name));
    const receipt = await this.readReceipt(target, name);

    if (receipt === undefined) {
      // A skill directory the tool has no receipt for. Reported, never touched.
      return {
        name,
        version: '0.0.0' as InstalledSkill['version'],
        agentId: target.agentId,
        scope: target.scope,
        directory,
        registry: 'unknown',
        installedAt: '',
        unmanaged: true,
        modified: false,
        dependencyOf: [],
      };
    }

    return {
      name: receipt.name,
      version: receipt.version,
      agentId: target.agentId,
      scope: target.scope,
      directory,
      registry: receipt.registry,
      installedAt: receipt.installedAt,
      unmanaged: false,
      modified: await this.hasDrifted(this.baseFor(target, directory), receipt),
      dependencyOf: receipt.dependencyOf,
    };
  }

  private async hasDrifted(base: string, receipt: InstallReceipt): Promise<boolean> {
    for (const file of receipt.files) {
      const absolute = this.fs.join(base, ...file.path.split('/'));
      if (!(await this.fs.exists(absolute))) return true;
      const current = await this.hasher.hashFile(absolute).catch(() => undefined);
      if (current !== file.integrity) return true;
    }
    return false;
  }

  private async readReceipt(
    target: AgentTarget,
    name: string,
  ): Promise<InstallReceipt | undefined> {
    const path = this.fs.join(target.root, ...receiptPath(name).split('/'));
    if (!(await this.fs.exists(path))) return undefined;
    try {
      return parseReceipt(await this.fs.readTextFile(path), path);
    } catch (error) {
      this.logger.warn(`Ignoring unreadable install receipt ${path}`);
      this.logger.debug(String(error));
      return undefined;
    }
  }
}

function decideOutcome(
  previous: InstalledSkill | undefined,
  request: InstallRequest,
): InstallResult['outcome'] {
  if (previous === undefined || previous.unmanaged) return 'installed';

  const change = classifyChange(previous.version, request.pkg.manifest.version);
  if (change === 'downgrade') return 'downgraded';
  if (change === 'same') return previous.modified ? 'reinstalled' : 'unchanged';
  return 'upgraded';
}
