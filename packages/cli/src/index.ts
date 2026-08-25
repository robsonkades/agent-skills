/**
 * `@jvm-expert/agent-skills` — the command-line interface and the composition root.
 *
 * Importable so that tests (and any embedding tool) can drive the CLI in-process rather than
 * shelling out.
 */
export { VERSION, run } from './cli.ts';
export { createContainer, TOOL_NAME, type Container, type ContainerOptions } from './container.ts';
export { collect, resolveScope, type GlobalOptions } from './options.ts';
