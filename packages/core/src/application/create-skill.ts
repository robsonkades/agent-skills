import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import { DEFAULT_PACKAGE_KIND, type PackageKind } from '../domain/manifest.ts';
import { assertValidSkillName } from '../domain/skill-ref.ts';
import { decodeText } from '../domain/skill-package.ts';
import { scaffoldPackage } from './package-loader.ts';
import type { ApplicationContext } from './context.ts';

export interface CreateOptions {
  readonly name: string;
  /** Defaults to `skill`. */
  readonly kind?: PackageKind;
  /** Parent directory. Defaults to the process cwd. */
  readonly directory?: string;
  readonly description?: string;
  readonly license?: string;
  readonly author?: string;
  readonly dryRun?: boolean;
}

export interface CreateReport {
  readonly name: string;
  readonly kind: PackageKind;
  readonly directory: string;
  readonly files: readonly string[];
  readonly dryRun: boolean;
}

/**
 * Scaffolds a new skill package.
 *
 * The generated package is deliberately *valid but incomplete*: `agent-skills validate` on a
 * fresh scaffold passes with warnings pointing at the placeholder text, so an author's first
 * experience of the validator is a useful checklist rather than a wall of errors.
 */
export class CreateSkill {
  private readonly ctx: ApplicationContext;

  constructor(ctx: ApplicationContext) {
    this.ctx = ctx;
  }

  async execute(options: CreateOptions): Promise<CreateReport> {
    assertValidSkillName(options.name);

    const parent = this.ctx.fs.resolve(options.directory ?? this.ctx.env.cwd());
    const directory = this.ctx.fs.join(parent, options.name);

    if (await this.ctx.fs.exists(directory)) {
      throw new AgentSkillsError(ErrorCode.USAGE, `${directory} already exists`, {
        hints: ['Choose another name, or remove the existing directory first'],
        data: { directory },
      });
    }

    const kind = options.kind ?? DEFAULT_PACKAGE_KIND;
    const files = scaffoldPackage(options.name, {
      kind,
      ...(options.description === undefined ? {} : { description: options.description }),
      ...(options.license === undefined ? {} : { license: options.license }),
      ...(options.author === undefined ? {} : { author: options.author }),
    });

    if (options.dryRun !== true) {
      for (const file of files) {
        const absolute = this.ctx.fs.join(directory, ...file.path.split('/'));
        await this.ctx.fs.mkdirp(this.ctx.fs.dirname(absolute));
        await this.ctx.fs.writeFile(absolute, decodeText(file.bytes));
      }
      // Conventional empty directories, created so the author sees where things go. A command
      // installs as a single file, so it has nowhere to put them.
      if (kind === 'skill') {
        for (const extra of ['examples', 'scripts']) {
          await this.ctx.fs.mkdirp(this.ctx.fs.join(directory, extra));
        }
      }
    }

    return {
      name: options.name,
      kind,
      directory,
      files: files.map((file) => file.path),
      dryRun: options.dryRun === true,
    };
  }
}
