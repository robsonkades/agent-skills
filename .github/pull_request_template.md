## What and why

<!-- What changes, and what problem it solves. The diff shows the "what"; explain the "why". -->

## Type

- [ ] Bug fix
- [ ] New feature
- [ ] New skill
- [ ] New agent adapter
- [ ] Documentation
- [ ] Refactor

## Checklist

- [ ] `npm run verify` passes
- [ ] Tests added for the change (a bug fix has a test that failed before it)
- [ ] Documentation updated if behaviour changed
- [ ] `CHANGELOG.md` updated under Unreleased, for anything user-visible
- [ ] Conventional commit messages

## For a skill

- [ ] `agent-skills validate <path> --strict` passes
- [ ] The description says what it covers **and when to use it**
- [ ] Detail is in `references/`, not in `SKILL.md`
- [ ] No agent-specific instructions in the body
- [ ] `npm run registry:build` re-run

## For an adapter

- [ ] Paths verified against the real agent, not just its documentation
- [ ] Depends on `@jvm-expert/core` only
- [ ] Registered in `check-boundaries.mjs` and the CLI container
- [ ] Tests cover detection, locations, projection and purity

## Breaking changes

<!-- None, or what breaks and how to migrate. -->
