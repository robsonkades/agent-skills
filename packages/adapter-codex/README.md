# @jvm-expert/adapter-codex

OpenAI Codex adapter for agent-skills.

Part of [agent-skills](https://github.com/robsonkades/agent-skills), a package manager for AI
coding-agent skills. Most people want the CLI:

```bash
npx @jvm-expert/agent-skills install java-performance
```

Installs to `\/skills` globally (default `~/.codex/skills`) and `.agents/skills` per
project, synthesising `metadata.short-description` and `agents/openai.yaml` from neutral
manifest fields.

## Licence

Apache-2.0
