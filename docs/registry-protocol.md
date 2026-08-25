# Registry protocol

A registry answers four questions:

1. What skills exist?
2. What versions exist for a name?
3. What is the manifest of a version?
4. Give me the bytes.

Anything that can answer them is a registry. Three drivers ship in v1 — local, git and HTTPS —
and they differ only in transport.

---

## The index document

Every registry serves the same index. Git and local registries keep it at
`registry/skills.yaml` relative to the registry root; an HTTP registry serves it at the
configured URL.

```yaml
schemaVersion: 1
name: official
updatedAt: 2026-08-23T00:00:00Z

skills:
  - name: java-performance
    description: Java performance engineering on the JVM.
    keywords: [java, jvm, performance]
    latest: 1.0.0
    versions:
      - version: 1.0.0
        path: skills/java-performance # git and local
        integrity: sha256-Y4Is8pJpAyfkZYvFW9b5ItWwMD4FoxgADnY5XLR38O8=
        publishedAt: 2026-08-23T00:00:00Z
        deprecated: false
      - version: 0.9.0
        tarball: https://cdn.example.com/java-performance-0.9.0.tgz # http
        integrity: sha256-...
        deprecated: true
        deprecationReason: Superseded by 1.0.0
```

### Fields

| Field                          | Required    | Notes                                                             |
| ------------------------------ | ----------- | ----------------------------------------------------------------- |
| `schemaVersion`                | no          | Defaults to `1`. Higher than the CLI understands is a hard error. |
| `name`                         | no          | Falls back to the configured registry name.                       |
| `updatedAt`                    | no          | Informational.                                                    |
| `skills[].name`                | **yes**     | Must satisfy the skill-name grammar.                              |
| `skills[].description`         | no          | Shown in `search`.                                                |
| `skills[].keywords`            | no          | Searched.                                                         |
| `skills[].latest`              | no          | Defaults to the newest non-deprecated version.                    |
| `skills[].versions`            | **yes**     | At least one. Sorted newest-first on load.                        |
| `versions[].version`           | **yes**     | Strict semver.                                                    |
| `versions[].path`              | either      | Package directory, relative to the registry root.                 |
| `versions[].tarball`           | either      | Absolute or index-relative `.tar.gz` URL.                         |
| `versions[].integrity`         | recommended | Verified against the fetched content.                             |
| `versions[].publishedAt`       | no          | Shown by `info`.                                                  |
| `versions[].deprecated`        | no          | Excluded from range resolution; still resolvable by exact pin.    |
| `versions[].deprecationReason` | no          | Shown as a warning on install.                                    |

`path` and `tarball` are mutually exclusive; declaring both is an error.

### Design notes

**The index is denormalised on purpose.** `search` and `info` must work from a single cached
fetch. Forcing a per-skill manifest request to render a search result would make the common
path N round-trips.

**`integrity` lives in the index, not only in the manifest.** The index is the document a
registry operator would sign; putting the hash there means a tampered payload is caught even if
the manifest inside it was rewritten to match.

**Versions are an explicit list, never a directory listing.** Listings are not available over
static HTTPS hosting and differ per git host. An explicit list makes all three drivers behave
identically.

---

## Registry kinds

### `local`

```bash
agent-skills registry add mine ./my-skills --kind local
agent-skills registry add mine file:///srv/skills --kind local
```

Reads directly from a directory. Useful for developing a skill, for an air-gapped mirror, and
as the test double for the whole protocol.

### `git` — the v1 default

```bash
agent-skills registry add official https://github.com/robsonkades/agent-skills.git
agent-skills registry add company  https://git.acme.internal/skills.git#stable
```

Requires no infrastructure: a repository with `registry/skills.yaml` and `skills/` **is** a
registry, and its write path is a pull request — a better review surface for content that
becomes agent instructions than an upload API.

- Cloned shallow (`--depth 1`) into `~/.agent-skills/cache/git/<slug>-<hash>`.
- Refreshed on a TTL (default 1 hour); `--dry-run`-free commands reuse the cache within it.
- Once on disk, behaves exactly like a local registry.
- Requires `git` on `PATH`; the error says so, and suggests an HTTP registry instead.

### `http`

```bash
agent-skills registry add cdn https://skills.example.com/index.json
```

- The index is fetched over HTTPS and cached on disk, so `search` and `info` still work offline.
- Packages are `.tar.gz` payloads, extracted in memory through the same hardened extractor the
  rest of the system uses.
- Plaintext HTTP is refused unless the host is loopback (or `--allow-insecure` is passed).
- If the payload's name or version disagrees with what the index promised, the fetch is aborted
  as an integrity failure — not corrected.

---

## Precedence and conflict resolution

Registries form an **ordered list**; earlier wins.

```json
{
  "registries": [
    {
      "name": "company",
      "url": "https://git.acme.internal/skills.git",
      "kind": "git",
      "trusted": true
    },
    {
      "name": "official",
      "url": "https://github.com/robsonkades/agent-skills.git",
      "kind": "git",
      "trusted": true
    }
  ]
}
```

### The rule: precedence is by **name**, not by version

The first registry that publishes _any_ version of a name owns that name outright. A
lower-precedence registry cannot supply a higher version of a name an earlier one provides.

This is the property that prevents **dependency confusion** — the attack that has repeatedly
succeeded against npm and PyPI, where an attacker publishes `acme-internal-tool@99.0.0` to a
public registry and a resolver that picks "the highest version anywhere" installs it. Here,
`company` owning the name means `official` cannot reach it at any version.

### Qualified references bypass precedence

```bash
agent-skills install company:java-performance
agent-skills install official:java-performance
```

### Conflicts are shown, not hidden

`search` aggregates across every registry and labels duplicates:

```
java-performance@2.0.0  company
java-performance@1.0.0  official   shadowed by company
```

### Failures degrade, they do not promote

An unreachable registry is skipped during name resolution — it must not block a name another
registry can serve. It also does not silently promote the next registry to owner: `doctor`
reports the outage, and `refresh` fails only when _every_ registry is unreachable.

### Lockfiles pin the registry

`skills.lock` records the registry name and the fully qualified resolved location, so
reordering the registry list cannot silently redirect a reproducible install.

---

## Adding a registry backend

Implement `SkillRegistry` from `@jvm-expert/core`:

```ts
export interface SkillRegistry {
  readonly name: string;
  readonly kind: RegistryKind;
  readonly trusted: boolean;

  refresh(options?: RefreshOptions): Promise<void>;
  search(query: SearchQuery): Promise<readonly SkillSummary[]>;
  has(name: string): Promise<boolean>;
  versions(name: string): Promise<readonly IndexVersionEntry[]>;
  manifest(name: string, version: SemanticVersion): Promise<SkillManifest>;
  fetch(name: string, version: SemanticVersion): Promise<FetchedPackage>;
}
```

Then register it in `DefaultRegistryFactory`. Reach the outside world only through the
`FileSystem`, `HttpClient` and `CommandRunner` ports, so your driver stays testable and the
security guarantees continue to hold.
