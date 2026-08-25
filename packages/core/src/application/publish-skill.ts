import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import { computePackageIntegrity } from '../domain/integrity.ts';
import type { IndexSkillEntry, IndexVersionEntry } from '../domain/registry-index.ts';
import { compareVersions } from '../domain/version.ts';
import type { Hasher } from '../ports/infrastructure.ts';
import type { ApplicationContext } from './context.ts';
import { formatIssue } from './install-skills.ts';
import { validateDirectory } from './validate-package.ts';

export interface PublishOptions {
  /** Package directory. Defaults to the process cwd. */
  readonly directory?: string;
  /** Registry the version is destined for; used for the "already published" check. */
  readonly registry?: string;
  readonly dryRun?: boolean;
}

export interface PublishReport {
  readonly name: string;
  readonly version: string;
  readonly directory: string;
  readonly integrity: string;
  readonly registry?: string;
  /** The entry a maintainer adds to the registry index. */
  readonly indexEntry: IndexVersionEntry;
  /** Full skill entry, for a registry that does not yet list this name. */
  readonly skillEntry: IndexSkillEntry;
  readonly files: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * `publish` is prepare-and-emit, not upload.
 *
 * The v1 registry is a git repository, whose write path is a pull request — a better review
 * surface for "here is a new skill that will run inside your agent" than an API token. The
 * command therefore does every check a server would do, then hands back the exact index
 * entry to commit. `PublishTarget` exists so an HTTP registry can later take the same
 * validated result and POST it (DESIGN.md §9).
 */
export class PublishSkill {
  private readonly ctx: ApplicationContext;
  private readonly hasher: Hasher;

  constructor(ctx: ApplicationContext, hasher: Hasher) {
    this.ctx = ctx;
    this.hasher = hasher;
  }

  async execute(options: PublishOptions = {}): Promise<PublishReport> {
    const directory = options.directory ?? this.ctx.env.cwd();

    // Strict: unknown manifest fields are errors when publishing, because a typo that only
    // warns locally becomes a permanent part of a public registry.
    const validated = await validateDirectory(this.ctx, directory, { strict: true });

    if (!validated.ok) {
      throw new AgentSkillsError(ErrorCode.PUBLISH_REJECTED, 'Package failed validation', {
        details: validated.errors.map(formatIssue),
        hints: [`agent-skills validate ${directory} --strict   to iterate on the problems`],
        data: { directory, issues: validated.errors },
      });
    }

    const { manifest } = validated.pkg;
    const warnings = validated.warnings.map(formatIssue);

    await this.assertVersionIsNew(manifest.name, manifest.version, options.registry, warnings);
    await this.assertDependenciesResolve(manifest, warnings);

    const integrity = computePackageIntegrity(validated.pkg, this.hasher);

    if (manifest.integrity !== undefined && manifest.integrity !== integrity) {
      warnings.push(
        `skill.yaml declares integrity ${manifest.integrity}, but the contents hash to ${integrity}; the computed value is authoritative`,
      );
    }

    const indexEntry: IndexVersionEntry = {
      version: manifest.version,
      path: `skills/${manifest.name}`,
      integrity,
      publishedAt: this.ctx.clock.now().toISOString(),
      deprecated: false,
    };

    return {
      name: manifest.name,
      version: manifest.version,
      directory: validated.directory,
      integrity,
      ...(options.registry === undefined ? {} : { registry: options.registry }),
      indexEntry,
      skillEntry: {
        name: manifest.name,
        description: manifest.description,
        keywords: manifest.keywords,
        latest: manifest.version,
        versions: [indexEntry],
      },
      files: validated.pkg.files.map((file) => file.path),
      warnings,
    };
  }

  private async assertVersionIsNew(
    name: string,
    version: string,
    registryName: string | undefined,
    warnings: string[],
  ): Promise<void> {
    const registry =
      registryName === undefined
        ? this.ctx.registry.members()[0]
        : this.ctx.registry.named(registryName);

    if (registry === undefined) return;

    let published: readonly IndexVersionEntry[];
    try {
      published = await registry.versions(name);
    } catch {
      // A registry that cannot be reached must not block preparing a release; the
      // maintainer's pull request is the real gate.
      warnings.push(`Could not reach registry "${registry.name}" to check for version collisions`);
      return;
    }

    if (published.length === 0) return;

    if (published.some((entry) => entry.version === version)) {
      throw new AgentSkillsError(
        ErrorCode.PUBLISH_REJECTED,
        `${name}@${version} is already published in "${registry.name}"`,
        {
          hints: ['Bump the version in skill.yaml (and in SKILL.md if it declares one)'],
          data: { name, version, registry: registry.name },
        },
      );
    }

    const newest = published[0]!.version;
    if (compareVersions(version as never, newest) < 0) {
      warnings.push(
        `${version} is older than the currently published ${newest}; publishing it will not change "latest"`,
      );
    }
  }

  private async assertDependenciesResolve(
    manifest: { dependencies: readonly { name: string; version: string }[] },
    warnings: string[],
  ): Promise<void> {
    for (const dependency of manifest.dependencies) {
      const owner = await this.ctx.registry.ownerOf(dependency.name).catch(() => undefined);
      if (owner === undefined) {
        throw new AgentSkillsError(
          ErrorCode.PUBLISH_REJECTED,
          `Dependency "${dependency.name}" is not published in any configured registry`,
          {
            hints: [
              'Publish the dependency first, or make it an optionalDependency',
              'agent-skills registry list   to check where the CLI is looking',
            ],
            data: { dependency: dependency.name },
          },
        );
      }
      warnings.push(`dependency ${dependency.name}@${dependency.version} resolves via "${owner}"`);
    }
  }
}
