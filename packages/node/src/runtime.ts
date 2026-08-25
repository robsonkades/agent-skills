import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { access, constants } from 'node:fs/promises';
import {
  AgentSkillsError,
  ErrorCode,
  INTEGRITY_PREFIX,
  type Clock,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
  type Environment,
  type Hasher,
  type HttpClient,
  type HttpRequestOptions,
  type HttpResponse,
  type LogLevel,
  type Logger,
} from '@jvm-expert/core';

export class NodeEnvironment implements Environment {
  homeDir(): string {
    return os.homedir();
  }

  cwd(): string {
    return process.cwd();
  }

  tempDir(): string {
    return os.tmpdir();
  }

  platform(): string {
    return process.platform;
  }

  env(): Readonly<Record<string, string | undefined>> {
    return process.env;
  }
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class NodeHasher implements Hasher {
  hash(data: Uint8Array): string {
    return INTEGRITY_PREFIX + createHash('sha256').update(data).digest('base64');
  }

  async hashFile(target: string): Promise<string> {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(target)) digest.update(chunk as Buffer);
    return INTEGRITY_PREFIX + digest.digest('base64');
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

/**
 * HTTPS client built on `fetch`.
 *
 * Two policies are enforced here rather than at call sites: plaintext HTTP is refused
 * outright (loopback excepted, for local development registries), and the response body is
 * capped so a hostile server cannot exhaust memory before integrity checking gets a chance
 * to run.
 */
export class NodeHttpClient implements HttpClient {
  private readonly userAgent: string;
  private readonly allowInsecure: boolean;

  constructor(userAgent: string, allowInsecure = false) {
    this.userAgent = userAgent;
    this.allowInsecure = allowInsecure;
  }

  async get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    this.assertTransport(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': this.userAgent, ...(options.headers ?? {}) },
      });

      const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (declared > maxBytes) {
        throw new AgentSkillsError(
          ErrorCode.UNSAFE_ARCHIVE,
          `Response from ${url} declares ${declared} bytes, over the ${maxBytes} byte limit`,
          { data: { url, declared, maxBytes } },
        );
      }

      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > maxBytes) {
        throw new AgentSkillsError(
          ErrorCode.UNSAFE_ARCHIVE,
          `Response from ${url} is ${body.byteLength} bytes, over the ${maxBytes} byte limit`,
          { data: { url, size: body.byteLength, maxBytes } },
        );
      }

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      };
    } catch (cause) {
      if (cause instanceof AgentSkillsError) throw cause;
      const aborted = cause instanceof Error && cause.name === 'AbortError';
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_UNAVAILABLE,
        aborted ? `Request to ${url} timed out` : `Request to ${url} failed`,
        {
          details: aborted ? [] : [cause instanceof Error ? cause.message : String(cause)],
          hints: ['Check your network connection and any proxy settings'],
          cause,
          data: { url },
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertTransport(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (cause) {
      throw new AgentSkillsError(ErrorCode.USAGE, `Invalid URL: ${url}`, { cause, data: { url } });
    }

    if (parsed.protocol === 'https:') return;

    const loopback =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';

    if (parsed.protocol === 'http:' && (this.allowInsecure || loopback)) return;

    throw new AgentSkillsError(
      ErrorCode.INSECURE_TRANSPORT,
      `Refusing to fetch over ${parsed.protocol}//`,
      {
        details: [url, '', 'Skill packages become instructions your coding agent follows.'],
        hints: ['Use an https:// URL', 'For a local development registry, use http://localhost'],
        data: { url, protocol: parsed.protocol },
      },
    );
  }
}

/**
 * Runs external commands. Used only for `git` and for agent version probes.
 *
 * Arguments are always passed as an array and the shell is never involved, so a registry URL
 * containing shell metacharacters cannot become a command injection.
 */
export class NodeCommandRunner implements CommandRunner {
  async run(
    command: string,
    args: readonly string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd ?? process.cwd(),
        env: { ...process.env, ...(options.env ?? {}) } as NodeJS.ProcessEnv,
        shell: false,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(
          new AgentSkillsError(
            ErrorCode.IO_ERROR,
            `Command timed out: ${command} ${args.join(' ')}`,
            {
              data: { command, args },
            },
          ),
        );
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      child.stdout?.on('data', (chunk) => (stdout += String(chunk)));
      child.stderr?.on('data', (chunk) => (stderr += String(chunk)));

      child.on('error', (cause) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new AgentSkillsError(ErrorCode.IO_ERROR, `Could not run "${command}"`, {
            details: [cause.message],
            hints: command === 'git' ? ['Install git, or use an http registry instead'] : [],
            cause,
            data: { command, args },
          }),
        );
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr });
      });
    });
  }

  async which(command: string): Promise<string | undefined> {
    const isWindows = process.platform === 'win32';
    const extensions = isWindows
      ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
      : [''];

    for (const directory of (process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean)) {
      for (const extension of extensions) {
        const candidate = path.join(directory, command + extension);
        try {
          await access(candidate, isWindows ? constants.F_OK : constants.X_OK);
          return candidate;
        } catch {
          // Try the next candidate.
        }
      }
    }
    return undefined;
  }
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Logs to stderr so `--json` output on stdout stays machine-parseable. */
export class ConsoleLogger implements Logger {
  private readonly threshold: number;

  constructor(level: LogLevel = 'info') {
    this.threshold = LEVEL_ORDER[level];
  }

  debug(message: string, ...args: readonly unknown[]): void {
    this.write('debug', message, args);
  }

  info(message: string, ...args: readonly unknown[]): void {
    this.write('info', message, args);
  }

  warn(message: string, ...args: readonly unknown[]): void {
    this.write('warn', message, args);
  }

  error(message: string, ...args: readonly unknown[]): void {
    this.write('error', message, args);
  }

  private write(level: LogLevel, message: string, args: readonly unknown[]): void {
    if (LEVEL_ORDER[level] < this.threshold) return;
    process.stderr.write(
      `${level === 'info' ? '' : `${level}: `}${message}${args.length > 0 ? ` ${args.map(String).join(' ')}` : ''}\n`,
    );
  }
}
