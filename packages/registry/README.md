# @jvm-expert/registry

Local, git and HTTPS skill registries, with precedence-aware federation.

Part of [agent-skills](https://github.com/robsonkades/agent-skills), a package manager for AI
coding-agent skills. Most people want the CLI:

```bash
npx @jvm-expert/agent-skills install java-performance
```

Three interchangeable drivers behind one interface, plus the federation that gives an ordered
list of registries its conflict-resolution semantics — the first registry publishing a name owns
it, which is what closes the dependency-confusion class of attack.

See [docs/registry-protocol.md](https://github.com/robsonkades/agent-skills/blob/main/docs/registry-protocol.md).

## Licence

Apache-2.0
