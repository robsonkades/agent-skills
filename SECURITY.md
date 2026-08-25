# Security Policy

## Reporting a vulnerability

**Do not open a public issue.**

Report privately through
[GitHub Security Advisories](https://github.com/robsonkades/agent-skills/security/advisories/new).

Please include what the issue is, how to reproduce it, and what an attacker gets. A proof of
concept helps enormously.

|                                                       | Target         |
| ----------------------------------------------------- | -------------- |
| Acknowledgement                                       | 48 hours       |
| Initial assessment                                    | 5 working days |
| Fix or mitigation for a confirmed high-severity issue | 30 days        |

We will keep you informed, credit you in the advisory unless you prefer otherwise, and
coordinate disclosure timing with you.

## Why this matters more than for a typical CLI

A skill is not data the tool merely stores. It is **instructions a coding agent will follow**,
inside a repository, with whatever tools that agent has. A malicious skill is closer to
malicious code than to a malicious README.

That framing drives every decision below.

## Threat model

We assume:

- **A skill package is attacker-controlled.** Any bytes in it may be hostile.
- **A registry may be compromised.** It may serve a package that does not match its index.
- **The network is hostile.** Responses may be modified in transit.
- **The user's filesystem may already contain hostile entries** — a symlinked skill directory
  planted earlier, for instance.

We do **not** currently defend against:

- A malicious skill whose _content_ is harmful but whose _packaging_ is valid. Integrity proves
  the bytes are the ones the registry served; it does not judge what they say. Reviewing what a
  skill instructs an agent to do is a human responsibility — which is why publishing goes
  through pull request review.
- A compromised registry that is also the one you trust and whose maintainers signed off. There
  is no signing in v1 (see [Roadmap](#roadmap)).
- Supply-chain compromise of this tool's own npm dependencies, beyond keeping them few (five
  runtime dependencies) and pinned by lockfile.

## Controls

| Threat                                               | Control                                                                                                                          | Where                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Path traversal (`../../.ssh/authorized_keys`)        | Every untrusted path passes one shared safety check before it is joined to anything                                              | `core/domain/path-safety.ts`                     |
| Absolute paths, drive letters, UNC paths             | Rejected explicitly, on every platform                                                                                           | same                                             |
| Windows reserved names (`CON`, `NUL`, `COM1`…)       | Rejected on every platform, so a Linux-built package cannot break a Windows machine                                              | same                                             |
| Trailing dot/space filenames                         | Rejected — Windows strips them, letting two different paths collide                                                              | same                                             |
| NTFS alternate data streams (`file:stream`)          | Rejected                                                                                                                         | same                                             |
| Control characters and NUL bytes in paths            | Rejected                                                                                                                         | same                                             |
| Symlink and hardlink planting                        | Any archive entry that is not a regular file or directory is refused outright                                                    | `installer/safe-extractor.ts`                    |
| Symlinked destination redirecting a write            | Resolved paths are re-checked for containment before every write                                                                 | `installer/safe-path.ts`                         |
| Decompression bombs                                  | Entry count, per-entry size, total size and compression-ratio caps                                                               | `installer/safe-extractor.ts`, `node/archive.ts` |
| Duplicate archive entries bypassing an earlier check | Duplicates are refused                                                                                                           | `installer/safe-extractor.ts`                    |
| Tampered payload                                     | sha-256 over a canonical content digest, checked against the registry index and the lockfile                                     | `core/domain/integrity.ts`                       |
| Registry serving a different package than requested  | Name and version in the payload are compared with what was asked for                                                             | `registry/http-registry.ts`                      |
| Dependency confusion                                 | Registry precedence is **by name**: the first registry publishing a name owns it, and a later one cannot inject a higher version | `registry/federation.ts`                         |
| Plaintext transport                                  | `http://` is refused outside loopback                                                                                            | `node/runtime.ts`                                |
| Partial or corrupted installs                        | Stage → validate → atomic rename, with rollback of the previous version on failure                                               | `installer/atomic-installer.ts`                  |
| Deleting files the tool does not own                 | Every install records a receipt; uninstall removes only recorded files whose hash still matches                                  | `installer/atomic-installer.ts`                  |
| Command injection through a registry URL             | External commands are spawned with an argument array and no shell                                                                | `node/runtime.ts`                                |
| Executable content                                   | `scripts/` is copied as data, without an executable bit, and is never run by this tool                                           | `installer/atomic-installer.ts`                  |

Each control has adversarial tests — hostile fixtures, not happy paths — in
`packages/installer/test/security.test.ts` and `packages/core/test/`.

## What the tool will never do

- Execute any code from a skill package.
- Write outside the target agent's skill directory.
- Delete a file it did not install, or one you modified after installation, without `--force`.
- Fetch a package over plaintext HTTP from a non-loopback host.
- Silently rewrite a hostile path into a safe one. Sanitising hides an attack; we refuse and
  say why.

## Roadmap

- **Package signing** (Sigstore). The manifest already reserves a `signatures` field, so adding
  it is not a breaking change.
- **Signed registry indexes**, so a compromised host cannot alter integrity hashes.
- **Capability declarations enforced rather than informational** — today `capabilities` in a
  manifest is metadata for humans and policy tooling; it grants nothing.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |
| < 1.0   | ❌        |
