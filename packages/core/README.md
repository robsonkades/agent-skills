# @jvm-expert/core

The agent-agnostic domain model, application services and port interfaces.

Part of [agent-skills](https://github.com/robsonkades/agent-skills), a package manager for AI
coding-agent skills. Most people want the CLI:

```bash
npx @jvm-expert/agent-skills install java-performance
```

This package knows nothing about Claude Code, Codex, git, HTTP or the filesystem. Everything it
needs from the outside world is a port interface, which is what lets an adapter or a registry
driver be written and tested without pulling in the rest of the system.

Import it when writing an agent adapter, a registry driver, or a tool that embeds the resolver.
Test doubles for every port ship as `@jvm-expert/core/testing`.

See [docs/adding-an-agent.md](https://github.com/robsonkades/agent-skills/blob/main/docs/adding-an-agent.md).

## Licence

Apache-2.0
