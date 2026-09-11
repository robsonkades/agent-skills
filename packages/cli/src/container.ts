import {
  AgentCatalog,
  ApplySkillUpdates,
  CheckUpdates,
  type AgentSkillsConfig,
  type ApplicationContext,
  type FederatedRegistry,
  type Hasher,
} from '@jvm-expert/core';
import { ClaudeCodeAdapter } from '@jvm-expert/adapter-claude';
import { CodexAdapter } from '@jvm-expert/adapter-codex';
import { AtomicInstaller, SafeExtractor } from '@jvm-expert/installer';
import { DefaultRegistryFactory, RegistryFederation } from '@jvm-expert/registry';
import {
  ConsoleLogger,
  FileConfigStore,
  NodeArchiveReader,
  NodeCommandRunner,
  NodeEnvironment,
  NodeFileSystem,
  NodeHasher,
  NodeHttpClient,
  SystemClock,
  cacheHome,
  FileUpdateStateStore,
  NpmToolUpdater,
  NodeSelectionPrompt,
} from '@jvm-expert/node';
import type { LogLevel } from '@jvm-expert/core';
import { fileURLToPath } from 'node:url';
import type { NotificationServices } from './update-notifications.ts';

export const TOOL_NAME = '@jvm-expert/agent-skills';

export interface ContainerOptions {
  readonly logLevel?: LogLevel;
  readonly allowInsecure?: boolean;
  readonly version: string;
}

export interface Container {
  readonly ctx: ApplicationContext;
  readonly hasher: Hasher;
  readonly configStore: FileConfigStore;
  readonly config: AgentSkillsConfig;
  readonly notifications: NotificationServices;
}

/**
 * The composition root.
 *
 * This is the only place in the project where a concrete class is chosen. Every layer above
 * receives interfaces, which is what makes "swap the registry", "swap the filesystem" and
 * "add an agent" true statements rather than aspirations.
 *
 * Registering a third-party adapter is one more `.register(...)` call here — or, once a
 * plugin loader exists, a line of configuration that ends up doing exactly this.
 */
export async function createContainer(options: ContainerOptions): Promise<Container> {
  const toolVersion = `${TOOL_NAME}@${options.version}`;

  const fs = new NodeFileSystem();
  const env = new NodeEnvironment();
  const clock = new SystemClock();
  const hasher = new NodeHasher();
  const commands = new NodeCommandRunner();
  const logger = new ConsoleLogger(options.logLevel ?? 'info');
  const http = new NodeHttpClient(
    `agent-skills/${options.version}`,
    options.allowInsecure === true,
  );

  const configStore = new FileConfigStore(fs, env);
  const config = await configStore.load();

  const agents = new AgentCatalog().register(new ClaudeCodeAdapter()).register(new CodexAdapter());

  const extractor = new SafeExtractor(new NodeArchiveReader());
  const registryFactory = new DefaultRegistryFactory({
    fs,
    hasher,
    http,
    commands,
    clock,
    logger,
    extractor,
    cacheDir: cacheHome(fs, env),
    ttlSeconds: config.cache.ttlSeconds,
  });

  const registry: FederatedRegistry = new RegistryFederation(
    config.registries.map((entry) => registryFactory.create(entry)),
  );

  const installer = new AtomicInstaller({ fs, hasher, clock, logger, toolVersion });

  const ctx: ApplicationContext = {
    agents,
    registry,
    installer,
    fs,
    env,
    commands,
    clock,
    logger,
    config,
    toolVersion,
  };
  const tool = new NpmToolUpdater({
    fs,
    env,
    commands,
    http,
    packageDirectory: fileURLToPath(new URL('../', import.meta.url)),
    nodeExecutable: process.execPath,
  });
  // Notification traffic has a short deadline and never launches credential prompts.
  // Its drivers share the normal registry cache, but installs keep their usual timeouts.
  const notificationFactory = new DefaultRegistryFactory({
    fs,
    hasher,
    clock,
    logger,
    extractor,
    cacheDir: cacheHome(fs, env),
    ttlSeconds: config.cache.ttlSeconds,
    http: { get: (url, request) => http.get(url, { ...request, timeoutMs: 2000 }) },
    commands: {
      which: (command) => commands.which(command),
      run: (command, args, request) =>
        commands.run(command, args, {
          ...request,
          timeoutMs: 2000,
          env: { ...request?.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
        }),
    },
  });
  const notificationRegistry = new RegistryFederation(
    config.registries.map((entry) => notificationFactory.create(entry)),
  );
  const notifications: NotificationServices = {
    check: new CheckUpdates(
      { ...ctx, registry: notificationRegistry },
      tool,
      new FileUpdateStateStore(fs, env),
    ),
    apply: new ApplySkillUpdates(ctx),
    tool,
    prompt: new NodeSelectionPrompt(),
    logger,
  };

  return {
    ctx,
    hasher,
    configStore,
    config,
    notifications,
  };
}
