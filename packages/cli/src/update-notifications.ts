import {
  AgentSkillsError,
  ErrorCode,
  type ApplySkillUpdates,
  type CheckUpdates,
  type SelectionPrompt,
  type SkillUpdateNotice,
  type ToolUpdater,
  type Logger,
} from '@jvm-expert/core';
import type { GlobalOptions } from './options.ts';

export interface NotificationServices {
  readonly check: Pick<CheckUpdates, 'execute' | 'dismiss' | 'remindLater'>;
  readonly apply: Pick<ApplySkillUpdates, 'execute'>;
  readonly tool: ToolUpdater;
  readonly prompt: SelectionPrompt;
  readonly logger: Logger;
}

export function shouldCheckUpdates(
  command: string,
  options: GlobalOptions & { offline?: boolean },
  terminal: { stdin: boolean; stdout: boolean; stderr: boolean },
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const ci = env['CI'];
  return (
    ['install', 'update', 'list', 'search', 'info', 'agents', 'doctor'].includes(command) &&
    terminal.stdin &&
    terminal.stdout &&
    terminal.stderr &&
    !(ci !== undefined && !['', '0', 'false'].includes(ci.toLowerCase())) &&
    env['AGENT_SKILLS_NO_UPDATE_NOTIFIER'] !== '1' &&
    env['TERM'] !== 'dumb' &&
    options.updateCheck !== false &&
    options.json !== true &&
    options.quiet !== true &&
    options.dryRun !== true &&
    options.offline !== true &&
    !(options.global === true && options.project === true)
  );
}

/** Returns true after replacing the CLI, so the old process stops before running a command. */
export async function showUpdateNotifications(
  services: NotificationServices,
  command: string,
  options: GlobalOptions,
  write: (message: string) => void = (message) => {
    process.stderr.write(`${message}\n`);
  },
): Promise<boolean> {
  let notices;
  try {
    notices = await services.check.execute({
      agents: options.agent,
      registry: options.registry,
      scope: options.global
        ? 'global'
        : options.project || options.projectRoot !== undefined
          ? 'project'
          : undefined,
      projectRoot: options.projectRoot,
      // These commands already select/install a release. An extra skill update before them
      // could contradict an explicit install pin or duplicate a requested update.
      skipSkills: command === 'install' || command === 'update',
    });
  } catch (error) {
    services.logger.debug('Update notifications unavailable', error);
    return false;
  }

  if (notices.tool !== undefined) {
    const notice = notices.tool;
    const action = await services.tool.action(notice.version).catch(() => ({
      label:
        'Update this installation with its original package manager, then restart agent-skills.',
      run: undefined,
    }));
    const choices = [
      ...(action.run === undefined ? [] : ['Update now']),
      'Remind me later',
      'Skip this version',
    ];
    const title =
      `Update available for agent-skills! ${notice.current} -> ${notice.version}` +
      `\n${safeText(action.label)}`;
    const choice = await services.prompt.choose(title, choices);
    if (choice === 0 && action.run !== undefined) {
      write(`Updating agent-skills to ${notice.version}...`);
      const result = await action.run();
      if (result.code !== 0) {
        throw new AgentSkillsError(ErrorCode.IO_ERROR, 'Could not update agent-skills', {
          details: [safeText(result.stderr || result.stdout)],
          hints: [safeText(action.label)],
        });
      }
      write('agent-skills updated. Run your command again to use the new version.');
      return true;
    }
    if (choice === choices.length - 1) await services.check.dismiss([notice]);
    else await services.check.remindLater([notice]);
  }

  const skills = notices.skills;
  if (skills.length === 0) return false;
  const compatible = skills.filter((item) => !item.requiresMajor);
  const major = skills.filter((item) => item.requiresMajor);
  for (;;) {
    const choices = [
      ...(compatible.length > 0
        ? [{ id: 'update', label: 'Update now (compatible versions)' }]
        : []),
      { id: 'details', label: 'View details' },
      ...(major.length > 0 ? [{ id: 'major', label: 'Review major updates' }] : []),
      { id: 'later', label: 'Remind me later' },
      { id: 'skip', label: 'Skip these versions' },
    ];
    const selected = await services.prompt.choose(
      `Skill updates available\n\n${skills.map(summary).join('\n')}`,
      choices.map((item) => item.label),
    );
    const choice = selected === undefined ? 'later' : choices[selected]?.id;
    if (choice === 'details') {
      for (const item of skills) {
        write(
          `${summary(item)}\n  Registry: ${safeText(item.registry)}\n  Directory: ${safeText(item.target.root)}`,
        );
      }
      write(
        'Dependencies are resolved during update. Modified files are protected by the installer.',
      );
      continue;
    }
    if (choice === 'skip') {
      await services.check.dismiss(skills);
      break;
    }
    if (choice === 'update' || choice === 'major') {
      let selectedUpdates = compatible;
      if (choice === 'major') {
        const approved = await services.prompt.choose(
          `These updates cross the compatible version range (--major):\n\n${major.map(summary).join('\n')}`,
          ['Go back', 'Update including these major versions'],
        );
        if (approved !== 1) continue;
        // A major candidate supersedes the compatible candidate for that installation.
        const majorTargets = new Set(major.map(installationKey));
        selectedUpdates = [
          ...compatible.filter((item) => !majorTargets.has(installationKey(item))),
          ...major,
        ];
      }
      write('Updating skills...');
      const reports = await services.apply.execute(selectedUpdates);
      for (const report of reports) {
        for (const result of report.results)
          write(
            `${result.outcome}: ${safeText(result.name)}@${result.version} (${safeText(result.agentId)}, ${result.scope})`,
          );
        for (const warning of report.warnings) write(safeText(warning));
      }
      break;
    }
    await services.check.remindLater(skills);
    break;
  }
  return false;
}

function installationKey(item: SkillUpdateNotice): string {
  return JSON.stringify([item.target.agentId, item.target.root, item.registry, item.name]);
}

function summary(item: SkillUpdateNotice): string {
  return (
    `  ${safeText(item.name)}  ${item.current} -> ${item.version}  (${safeText(item.target.displayName)}, ${item.target.scope})` +
    (item.requiresMajor ? ' [requires --major]' : '') +
    (item.modified ? ' [modified locally]' : '')
  );
}

/** Registry names and custom roots may contain terminal control characters. */
function safeText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
}
