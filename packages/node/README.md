# @jvm-expert/node

Node.js implementations of the agent-skills infrastructure ports.

Part of [agent-skills](https://github.com/robsonkades/agent-skills), a package manager for AI
coding-agent skills. Most people want the CLI:

```bash
npx @jvm-expert/agent-skills install java-performance
```

The only package that imports `node:fs`, `node:child_process`, `fetch` or `tar`. Swapping it out
is how the rest of the system would run on a different runtime.

## Licence

Apache-2.0
