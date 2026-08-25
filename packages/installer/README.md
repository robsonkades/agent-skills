# @jvm-expert/installer

The atomic, rollback-safe skill installation engine.

Part of [agent-skills](https://github.com/robsonkades/agent-skills), a package manager for AI
coding-agent skills. Most people want the CLI:

```bash
npx @jvm-expert/agent-skills install java-performance
```

The single write path into an agent's skill directory. Everything security-critical about
turning an untrusted package into files on disk lives here: path safety, archive extraction
limits, integrity verification, and the staged-then-renamed commit.

Concentrating it in one place is what lets every present and future agent adapter inherit the
same guarantees without re-implementing them.

See [SECURITY.md](https://github.com/robsonkades/agent-skills/blob/main/SECURITY.md).

## Licence

Apache-2.0
