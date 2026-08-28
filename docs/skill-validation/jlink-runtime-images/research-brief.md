# Research brief — `jlink-and-runtime-images`

**Question:** should this repository build a skill owning `jlink`, custom runtime images,
`jdeps` module discovery, image-shrinking flags, and the footprint/startup delta versus a
full JDK?

**Researcher's role:** justification test, not advocacy. A previous pass
(`docs/skill-validation/jvm-performance-suite-record.md`, line 16) dropped this topic as
"unjustified" with no stated evidence. This brief re-tests that decision independently.

**Date:** 2026-08-28.
**Executed against:** Temurin 25.0.3+9 (Windows x64, `C:\Users\robso\.jdks\temurin-25.0.3`);
GraalVM CE 25.0.2 (Windows x64); and — via Docker 29.5.3 — `eclipse-temurin:21-jdk`
(21.0.12+8), `eclipse-temurin:25-jdk` (25.0.4), `eclipse-temurin:26-jdk` (26.0.2+10),
`eclipse-temurin:25-jre`, `debian:trixie-slim`, `gcr.io/distroless/base-debian12`.
**Not executed:** JDK 27. Every JDK 27 claim below is labelled source-derived.

---

## 1. Verdict: **DROP**

**The earlier decision was right, and I am upholding it — but for a reason the earlier pass
did not state, and it leaves two specific findings unowned that should be placed into
existing skills.**

### The argument

The obvious test — "is jlink unmentioned?" — passes trivially and proves nothing. `jlink`
appears **once** in 237 skills, incidentally (§2). The topic is genuinely unowned. That is
not sufficient.

The real test is whether jlink changes a decision an engineer makes often enough, with
enough consequence, that no existing skill covers. It fails on **consequence**, and it fails
in a way my own measurements make sharper rather than softer:

**a. jlink's startup contribution is zero, and by default negative.** Measured (§4.4), 60
interleaved runs per variant: a plain jlink image starts at p50 **73 ms** against the full
JDK's **53 ms** — distributions fully disjoint (jlink min 69 > full JDK max 58). The cause
is that a jlink image ships **no default CDS archive** (§4.3); `--generate-cds-archive`
restores p50 to 53 ms, i.e. **parity, never an improvement**. An AOT cache does the same
(§4.5). So every "jlink made our service start faster" claim is a CDS or AOT claim wearing
jlink's name — and `startup-cds-crac-leyden` already owns both mechanisms and already owns
the rule that a silently-disabled archive is the failure mode.

**b. What is left is disk image size — a build-and-registry cost, not an SLO.** The size win
is real and larger than I expected (342 MB → 98.6 MB end-to-end, §4.7). But it does not move
latency, throughput, GC behaviour, memory footprint at runtime, or reliability. Nothing else
in this suite is organised around artefact size, and the repo has deliberately no
container-image-build skill at all. Owning image size for jlink alone would be scope creep
into a lane the repo has not opened.

**c. The consequential version of this decision is already owned twice.**
`graalvm-native-image` owns "leave the JVM to get small and start instantly" — a decision
with real stakes (closed-world analysis, reflection metadata, throughput ceiling).
`startup-cds-crac-leyden` owns "stay on the JVM and fix startup". jlink sits between them
owning the least consequential third: smaller, same speed.

**d. Frequency is low and structurally falling.** The population this suite targets ships
Spring Boot services from `eclipse-temurin:*-jre` or a Paketo buildpack. jlink is a platform
packaging decision made once per organisation, by one person, often never. JEP 493 (§3.1)
cut the JDK's own size ~25%, and `-jre` base images already exist — both erode the motive.

**e. The load-bearing content compresses to about eight rules.** Everything genuinely
non-obvious I established (§3, §5) fits on one reference page. Compare the exemplar
`jvm-performance-review`, which owns a _recurring activity_ — auditing a supplied artefact —
with four references behind it. jlink has no recurring activity behind it.

### What the drop leaves unowned — and where it should go

Dropping the package is correct. Dropping the **findings** is not. Two belong in existing
skills:

1. **`startup-cds-crac-leyden` — required.** A jlink runtime image ships without the default
   CDS archive, silently, on JDK 21, 25 and 26 (§4.3, §4.6). This is _exactly_ that skill's
   declared territory: its Purpose covers "verifying the cache is really in use", and it
   already carries the rule "a stale archive is disabled _silently_: no error, no speedup."
   This is the same failure class with a different cause, and its own skill says to check for
   it. Suggested rule, ~6 lines:

   > A `jlink` runtime image contains **no default CDS archive** — the JDK's `bin/server/*.jsa`
   > files are not modules and are not carried into the image. The image starts fine and
   > reports `mixed mode` where the full JDK reports `mixed mode, sharing`; `-Xshare:on`
   > refuses to boot the VM. Measured on Temurin 25.0.3 (Windows x64, 60 interleaved runs,
   > trivial main): p50 73 ms versus the full JDK's 53 ms, distributions disjoint. The fix is
   > the `--generate-cds-archive` jlink plugin, which restores p50 to 53 ms and costs
   > +29.3 MB (38.0 MB → 67.3 MB). Reproduces on Temurin 21.0.12 and 26.0.2 (Linux).
   > Application-level AppCDS and Leyden AOT caches are unaffected — they work normally on a
   > jlink image.

2. **`graalvm-native-image` — optional, one line.** In the strategy framing at workflow step 1,
   note jlink as the third option and bound it: it reduces image size only, and contributes
   nothing to startup.

### If the decision is overturned and it is built anyway

Scope boundary, stated so a future reader can hold the skill to it:

- **Owns:** producing the image (`jdeps --print-module-deps` → `--add-modules` → flags),
  the flag semantics that are silently wrong (§3.2, §3.3), the automatic-module refusal
  (§3.5), JEP 493 as a _vendor build choice_ (§3.1), the CDS archive loss and its cost,
  and the container-layer arithmetic that decides whether any of it is visible (§4.7).
- **Cedes to `startup-cds-crac-leyden`:** every claim about what CDS/AppCDS/AOT _do_, how to
  train them, and how to verify them. The jlink skill may state only "the image lost the
  default archive; the mechanism is that skill's."
- **Cedes to `graalvm-native-image`:** the whole "should this be AOT instead" decision.
- **Cedes to `component-and-release-boundaries`:** whether the _application_ should be
  modular. jlink does not need it (§3.5) and must not be used as an argument for it.
- **Required description disclaimer:** "Most JVM services never invoke jlink — they ship from
  a vendor `-jre` base image or a buildpack, and that is usually correct. Use this only when
  image size is a named, budgeted constraint. jlink does not improve startup; by default it
  makes it worse."

---

## 2. Ownership map — every occurrence in the tree

Searched `C:\git\agent-skills` for `jlink|jmod|jdeps|JPMS|module-info|--compress|strip-debug|ALL-MODULE-PATH|add-modules`, case-insensitive.

### `jlink` — 1 occurrence, incidental

| File                                  | Line | Context                                                                                                                                                                                                        |
| ------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/simd-and-vector-api/SKILL.md` | 72   | "`--add-modules jdk.incubator.vector` must reach **both** `javac` and `java` — and every build, CI, test-JVM, JMH and `jlink` wrapper in between." jlink named only as one more place a flag must be repeated. |

### `jmod`, `--generate-cds-archive`, `--no-header-files`, `--limit-modules`, `ALL-MODULE-PATH`, "runtime image", "custom runtime" — **zero occurrences**

`docs/skill-validation/jvm-performance-suite-record.md:16` records the earlier drop. Not a skill.

### `--compress` / `strip-debug` — 2 occurrences, both GraalVM, both a _different tool_

| File                                                              | Line | Context                                                                                                                                    |
| ----------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `skills/graalvm-native-image/SKILL.md`                            | 78   | "Real binary size reduction is `--strip-debug` (a genuine flag) plus a post-build `upx` pass, not a compression option on `native-image`." |
| `skills/graalvm-native-image/references/build-and-measurement.md` | 116  | `native-image -jar myapp.jar --strip-debug -o myapp`                                                                                       |

**Note a live collision risk.** `graalvm-native-image` says there _is no_ compression option —
true for `native-image`. jlink's `--compress` is a real and load-bearing option (§4.2). A
jlink skill must not be read as contradicting that line; both are correct about their own tool.

### `jdeps` — 5 occurrences, all dependency-graph analysis, none module-image related

| File                                                             | Line             | Use                                                                   |
| ---------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------- |
| `skills/java-cohesion-coupling/SKILL.md`                         | 26               | `jdeps -verbose:class` to build the real dependency graph             |
| `skills/java-cohesion-coupling/references/dependency-graphs.md`  | 6–8, 19, 34, 119 | `-verbose:class`, `-verbose:package`, `-dotoutput`; verification step |
| `skills/java-cohesion-coupling/references/metrics-and-limits.md` | 33               | reflection creates edges `jdeps` never sees                           |
| `skills/java-dependency-inversion/references/worked-example.md`  | 143              | `jdeps` shows no edge                                                 |

**`jdeps --print-module-deps` and `--generate-module-info` — the two modes a jlink skill would
actually use — appear nowhere.** Existing coverage is `jdeps`-as-architecture-tool, an
orthogonal use.

### `JPMS` / `module-info` — 24 occurrences across 10 skills, all _architecture_, none _packaging_

`component-and-release-boundaries` (SKILL.md 4, 110, 135; skill.yaml 6, 35;
`references/component-principles.md` 9, 199–210), `java-dependency-inversion`
(SKILL.md 5, 27, 67; skill.yaml 7, 30; `references/decision-guide.md` 41–66;
`references/worked-example.md` 143), `java-api-design` (SKILL.md 6; skill.yaml 8, 33;
`references/worked-example.md` 48; `references/compatibility.md` 62), `java-cohesion-coupling`
(SKILL.md 6, 27, 53; skill.yaml 8, 30), `layering-and-boundaries` (SKILL.md 146;
`references/boundary-enforcement.md` 33), `java-refactoring/references/compatibility.md` 54–55,
`java-solid` 75, `gof-facade` 73, `java-annotations/references/retention-targets-and-processing.md` 106,
`java-reflection-and-method-handles/references/method-handles-and-encapsulation.md` 79 + skill.yaml 33,
`jvm-class-loading/SKILL.md` 35 (`IllegalAccessError` "does not export" is JPMS, not classpath),
`tcp-tuning/references/sysctl-and-socket-options.md` 82–83 (`--add-modules jdk.net`).

The consistent framing is **JPMS as enforced encapsulation and release boundary**
(`component-principles.md:207`: "JPMS enforces encapsulation, Maven enforces release").
**Not one of these connects `module-info.java` to producing a runtime image.**

### Competitor skills read in full

- `skills/graalvm-native-image/SKILL.md` — owns AOT. No jlink mention. Its startup framing
  ("immediate startup … not peak performance without warm-up") is the direct competitor answer.
- `skills/startup-cds-crac-leyden/SKILL.md` — owns CDS/AppCDS/Leyden AOT/CRaC. **No jlink
  mention.** Its rule "a stale archive is disabled _silently_: no error, no speedup" is the
  nearest existing statement to the finding in §4.3, but does not cover this cause.
- `skills/jvm-class-loading/SKILL.md` — owns loading/linking cost and Metaspace. Rule at line
  62: "CDS and the AOT cache accelerate loading and linking". No jlink, no image construction.
- `skills/container-awareness/SKILL.md`, `skills/jvm-memory-regions/SKILL.md` — both budget
  **runtime** memory (cgroups, RSS, heap/Metaspace/code cache). Neither mentions disk or image
  size. Image footprint has no owner anywhere in the repo.

**Conclusion of the ownership map:** the topic is genuinely unowned, and the adjacent skills
are well-delimited against each other. Absence of coverage is established; it is not by itself
the justification.

---

## 3. Established facts, version-scoped and sourced

### 3.1 JEP 493 "Linking Run-Time Images without JMODs"

- **Number, title, status, target: JEP 493, delivered in JDK 24.** Implemented under
  `JDK-8311302`. Reduces JDK size ~25%. Requires the JDK to be _built_ with
  `--enable-linkable-runtime`; such a JDK ships **no `jmods` directory**.
  Sources: [openjdk.org/jeps/493](https://openjdk.org/jeps/493) (page returned HTTP 403 to
  direct fetch; content confirmed via search index and the Adoptium announcement),
  [RFR: 8311302](https://www.mail-archive.com/build-dev@openjdk.org/msg12846.html).
- **Temurin enables it from 24.0.0+36 onward.** Archive ~35% smaller, on-disk ~15% smaller, no
  `jmods` folder.
  Source: [Eclipse Temurin JDK 24 enables JEP 493 — Adoptium](https://adoptium.net/news/2025/08/eclipse-temurin-jdk24-JEP493-enabled),
  [adoptium/temurin-build#4035](https://github.com/adoptium/temurin-build/issues/4035).
- **Documented limitation: such a jlink cannot produce an image containing `jdk.jlink`.**
  Verified executed (§4.6).
- **It is a vendor build choice, not a JDK-version property.** Verified executed: Temurin 25.0.3
  reports `Linking from run-time image enabled` and has no `jmods`; **GraalVM CE 25.0.2 — the
  same JDK version — reports `Linking from run-time image disabled` and ships `jmods`.**
  Any skill claiming "JDK 24+ has no jmods" would be wrong. The claim must be scoped to the
  distribution.

### 3.2 `--compress` value syntax

- **Changed in JDK 21**, under `JDK-8293667` "Align jlink's `--compress` option with jmod's
  `--compress` option". `zip-0`..`zip-9` replaced the abstract `0|1|2`; the old values are
  **deprecated, not removed**.
  Sources: [RFR: 8293667 (core-libs-dev, Feb 2023)](https://mail.openjdk.org/pipermail/core-libs-dev/2023-February/100453.html),
  [MJLINK-77](https://www.mail-archive.com/issues@maven.apache.org/msg263296.html),
  [nipafx, Road to 21](https://nipafx.dev/road-to-21-upgrade/).
- Verified executed on **21.0.12, 25.0.3, 25.0.4 and 26.0.2**: `--compress=2` still exits 0
  with a deprecation warning on all four (§4.2, §4.6). JDK 26 rewords the help text but keeps
  the values.
- **JDK 27: source-derived only, and the source is only "a future release".** No removal date
  is published. Do not state that `--compress=2` is removed in 27.

### 3.3 What `--compress` actually defaults to — the help text is misleading

`jlink --help` says "Default is zip-6." **Measured, that is not what omitting the option does.**
Temurin 25.0.3, `--add-modules java.base`, `lib/modules` size: no `--compress` → **29,813,048 B**;
`--compress=zip-0` → 30,130,715 B; `--compress=zip-6` → **13,922,332 B**. Omitting the flag
produces an essentially uncompressed image. "Default is zip-6" describes the default _within_
the `zip-N` form, not the behaviour when the option is absent.

### 3.4 What jlink does **not** do

- **It does not shrink the heap.** jlink is a link-time packaging tool; it emits no VM flags
  and changes no ergonomics. (Not separately measured — mechanism, not a number.)
- **It does not remove unused classes within a module — confirmed, no class-level
  tree-shaking.** Verified executed (§4.6): an image built for a one-class Hello World contains
  **7,372 of the full JDK's 7,379 `java.base` classes — 99.9%**. The granularity is the module,
  full stop. This is the single most load-bearing correction against GraalVM-flavoured
  intuition, where points-to analysis genuinely does eliminate unreached code.
- **It does not require the application to be modular — and `--add-modules ALL-MODULE-PATH` is
  _not_ the escape hatch.** See §3.5. The real pattern is: jlink an image of **JDK modules
  only**, then run the ordinary non-modular application on the classpath against it. Verified
  executed: `./img-real-strip/bin/java -cp classes Hello` works.

### 3.5 `ALL-MODULE-PATH` — the widely repeated recipe is false

Verified executed on Temurin 25.0.3 (§4.6), three separate failures:

- On a plain jar with classes in the unnamed package →
  `FindException: Unable to derive module descriptor … unnamed package not allowed in module`.
- On a properly packaged jar that `jar --describe-module` confirms is a valid **automatic**
  module → `Error: automatic module cannot be used with jlink`. This is a flat refusal, and it
  fires for `--add-modules <name>` too, not only `ALL-MODULE-PATH`.
- With no `--module-path` at all, on a JEP 493 runtime →
  `Error: --module-path option must be specified with --add-modules ALL-MODULE-PATH` (exit 2).

`ALL-MODULE-PATH` therefore means "every module on the module path you supplied", and jlink
accepts only _explicit_ modules on it. `ALL-DEFAULT` — valid for `java --add-modules` — is
**not** a jlink token: `Error: Module ALL-DEFAULT not found`. To take everything in Java SE,
the module is `java.se`.

### 3.6 CDS / AOT interaction

- **A jlink image loses the JDK's default CDS archive.** Verified executed on Temurin 21.0.12,
  25.0.3 and 26.0.2 (§4.3, §4.6). No warning, exit 0.
- **`--generate-cds-archive` is a jlink plugin that fixes it**, at real size cost (§4.3).
- **AppCDS and the Leyden AOT cache work normally on a jlink image** — no documented or
  observed constraint. Verified executed (§4.5): `-XX:AOTCacheOutput` produced an 8.45 MB cache
  on the jlink image and `-XX:AOTCache` mapped it (`[aot] Opened AOT cache app.aot`).

---

## 4. Executed evidence

All sizes are `du -sb` **bytes**. Windows measurements: Temurin 25.0.3+9, Windows 11 Pro
26200, from Git Bash, in the session scratchpad. Container measurements: Docker 29.5.3,
`docker images` reported size.

### 4.1 Baseline sizes — Temurin 25.0.3 (Windows x64)

```
$ du -sb "C:/Users/robso/.jdks/temurin-25.0.3"
303790991    # full JDK, 303.8 MB
```

| Image            | `--add-modules`        | Extra flags                          |      Bytes |   MB |  vs full JDK |
| ---------------- | ---------------------- | ------------------------------------ | ---------: | ---: | -----------: |
| `img-base`       | `java.base`            | —                                    | 51,416,299 | 51.4 | 5.9× smaller |
| `img-base-strip` | `java.base`            | strip+nohdr+noman+zip-6              | 33,101,204 | 33.1 |     **9.2×** |
| `img-real`       | 5-module realistic set | —                                    | 65,506,321 | 65.5 |         4.6× |
| `img-real-strip` | 5-module realistic set | strip+nohdr+noman+zip-6              | 38,033,517 | 38.0 |     **8.0×** |
| `img-javase`     | `java.se`              | strip+nohdr+noman+zip-6              | 53,981,152 | 54.0 |         5.6× |
| `img-cds`        | 5-module realistic set | above **+ `--generate-cds-archive`** | 67,328,109 | 67.3 |         4.5× |

Realistic set = `java.base,java.logging,java.sql,java.naming,jdk.unsupported`. Resolution is
transitive: requesting 5 produced **8** modules — `java.security.sasl`, `java.transaction.xa`
and `java.xml` arrived unrequested (`--list-modules` on the image).

**The finding that reframes module discovery:** all of Java SE, stripped and compressed, is
**54.0 MB**; `java.base` alone is **33.1 MB**. The entire `jdeps`-driven minimisation exercise
is worth at most **20.9 MB out of 303.8 MB — 6.9% of the original**. The 8× win comes from
dropping the JDK _tools and jmods_, not from choosing modules precisely.

### 4.2 Flag decomposition — which flag actually pays

Realistic set, each flag in isolation, Temurin 25.0.3:

| Flags                              |      Bytes |   MB | Saved vs 65,506,321 |
| ---------------------------------- | ---------: | ---: | ------------------: |
| _(none)_                           | 65,506,321 | 65.5 |                   — |
| `--no-header-files --no-man-pages` | 65,315,706 | 65.3 |  **0.19 MB (0.3%)** |
| `--strip-debug`                    | 59,337,410 | 59.3 |       6.2 MB (9.4%) |
| `--compress=zip-6`                 | 41,379,559 | 41.4 | **24.1 MB (36.8%)** |
| all four                           | 38,033,517 | 38.0 |     27.5 MB (41.9%) |

`--compress` is the only flag that matters. `--no-header-files`/`--no-man-pages` are noise —
on Windows they remove only `include/` (190,615 B); there are no man pages to remove.

`bin/` is **19,295,920 B and is not reduced by any of these flags** — after compression it is
51% of `img-real-strip`. The remaining lever is `--strip-native-commands`, at the cost of the
launchers.

Compression levels, `java.base`, `lib/modules` only:

| `--compress` | `lib/modules` B | whole image B |
| ------------ | --------------: | ------------: |
| _(omitted)_  |      29,813,048 |    51,416,299 |
| `zip-0`      |      30,130,715 |    51,733,966 |
| `zip-6`      |      13,922,332 |    35,525,583 |
| `zip-9`      |      13,898,871 |    35,502,122 |

`zip-9` beats `zip-6` by **23,461 B — 0.17%**. Not worth the build time.

Legacy syntax, verbatim:

```
$ jlink --add-modules java.base --compress=2 --output img-c2
Warning: The 2 argument for --compress is deprecated and may be removed in a future release
exit=0
35525583    # identical to zip-6, as documented

$ jlink --add-modules java.base --compress=1 --output img-c1
Warning: The 1 argument for --compress is deprecated and may be removed in a future release
exit=0
42078329
```

**Answer to the brief's question: `--compress=2` still works on JDK 25.** It warns; it does not
error. Same on 21.0.12 and 26.0.2 (§4.6).

### 4.3 The CDS finding

```
$ ls "$JDK/lib/server/"*.jsa
ls: cannot access '.../lib/server/*.jsa': No such file or directory

$ find "$JDK" -name "*.jsa"
.../temurin-25.0.3/bin/server/classes.jsa            15990784
.../temurin-25.0.3/bin/server/classes_coh.jsa        16580608
.../temurin-25.0.3/bin/server/classes_nocoops.jsa    16384000
.../temurin-25.0.3/bin/server/classes_nocoops_coh.jsa 16973824

$ find img-real-strip -name "*.jsa"
                                    # (empty)
```

```
$ "$JDK/bin/java" -version
OpenJDK 64-Bit Server VM Temurin-25.0.3+9 (build 25.0.3+9-LTS, mixed mode, sharing)

$ ./img-real-strip/bin/java -version
OpenJDK 64-Bit Server VM Temurin-25.0.3+9 (build 25.0.3+9-LTS, mixed mode)

$ ./img-real-strip/bin/java -Xshare:on -version
Error occurred during initialization of VM
Unable to use shared archive. Unrecoverable archive loading error (run with -Xlog:aot,cds for details): Unable to map shared spaces
```

The only difference in the success case is the absent word `sharing`. Nothing warns.

With the plugin:

```
$ jlink --add-modules java.base,java.logging,java.sql,java.naming,jdk.unsupported \
    --strip-debug --no-header-files --no-man-pages --compress=zip-6 \
    --generate-cds-archive --output img-cds
Created CDS archive successfully

$ find img-cds -name "*.jsa"
img-cds/bin/server/classes.jsa           14483456
img-cds/bin/server/classes_nocoops.jsa   14811136

$ ./img-cds/bin/java -version
OpenJDK 64-Bit Server VM Temurin-25.0.3+9 (build 25.0.3+9-LTS, mixed mode, sharing)
```

**Cost: 38,033,517 → 67,328,109 B, +29.3 MB, +77%.** The plugin generates 2 archives where the
JDK ships 4 — the `_coh` (compact object headers) variants are absent, so an image built this
way has no archive for a JVM run with `-XX:+UseCompactObjectHeaders`. _Not tested under that
flag; flagged as an unknown (§6)._

### 4.4 Startup distribution — the core measurement

**Method.** Trivial `Hello.java` (one `System.out.println`), compiled to `classes/`, run as
`java -cp classes Hello`. Three runtimes measured **round-robin interleaved** within each
iteration to defeat thermal and background drift, 5 untimed warm-up runs per runtime first to
warm the filesystem cache, then **60 timed iterations each (180 process launches)**. Wall time
per launch via `date +%s%N`, integer milliseconds. Windows 11, Temurin 25.0.3+9. Process-spawn
overhead is included and is a large constant on Windows — the _deltas_, not the absolutes, are
the result.

| Runtime                          |   n | min | p10 |    p50 | p90 | p99 | max | mean |
| -------------------------------- | --: | --: | --: | -----: | --: | --: | --: | ---: |
| Full JDK                         |  60 |  50 |  50 | **53** |  57 |  58 |  58 | 53.3 |
| jlink, no CDS (`img-real-strip`) |  60 |  69 |  70 | **73** |  77 |  79 |  86 | 73.7 |
| jlink + `--generate-cds-archive` |  60 |  49 |  50 | **53** |  57 |  63 |  68 | 53.6 |

Full sorted samples (ms):

```
fulljdk: 50 50 50 50 50 50 50 50 50 51 51 51 51 51 51 51 52 52 52 52 52 52 53 53 53 53 53 53
         53 53 53 53 53 53 53 53 54 54 54 54 54 55 55 55 55 55 55 55 55 55 55 57 57 57 57 57
         57 58 58 58
nocds:   69 69 69 70 70 70 70 70 70 70 70 71 71 71 72 72 72 72 72 72 72 72 72 72 73 73 73 73
         73 73 73 74 74 74 74 74 74 74 74 75 75 75 75 75 75 76 76 76 76 76 77 77 77 77 78 78
         79 79 79 86
cds:     49 49 49 50 50 50 50 50 50 50 50 51 51 51 51 51 51 51 51 52 52 52 52 52 52 52 53 53
         53 53 53 53 53 53 53 53 54 54 54 54 54 54 54 54 55 56 56 56 56 57 57 57 57 57 58 59
         60 61 63 68
```

**Reading the distributions honestly:**

- **jlink-without-CDS versus full JDK is far outside run-to-run noise.** The two supports are
  **completely disjoint**: the fastest jlink run (69 ms) is slower than the slowest full-JDK run
  (58 ms). 60/60 separation. **+20 ms at p50, +38%.** This is a real, reproducible regression.
- **jlink-with-CDS versus full JDK is _inside_ noise.** p50 identical (53 vs 53), means 53.6 vs
  53.3 — a 0.3 ms difference on a 53 ms measurement. The CDS variant has a slightly longer tail
  (max 68 vs 58) which I would not defend as signal at n=60. **The correct statement is parity,
  not a win and not a loss.**
- **jlink's own contribution to startup is therefore zero.** There is no configuration in which
  the jlink image started faster than the full JDK. The best available outcome is to get back to
  where you already were.

### 4.5 AOT cache on a jlink image

```
$ ./img-real-strip/bin/java -XX:AOTCacheOutput=app.aot -cp classes Hello
Launching child process ...\img-real-strip\bin\java to assemble AOT cache app.aot using configuration app.aot.config
Reading AOTConfiguration app.aot.config and writing AOTCache app.aot
AOTCache creation is complete: app.aot 8454144 bytes

$ ./img-real-strip/bin/java -XX:AOTCache=app.aot -Xlog:aot -cp classes Hello
[0.006s][info][aot] trying to map app.aot
[0.006s][info][aot] Opened AOT cache app.aot.
[0.006s][info][aot] The AOT cache was created with UseCompressedOops = 1, UseCompressedClassPointers = 1, UseCompactObjectHeaders = 0
```

Startup with an AOT cache, same method, **40 interleaved iterations each**, 5 untimed warm-ups:

| Runtime                         |   n | min | p10 |    p50 | p90 | max |
| ------------------------------- | --: | --: | --: | -----: | --: | --: |
| jlink (no CDS) + `-XX:AOTCache` |  40 |  50 |  50 | **52** |  56 |  63 |
| Full JDK + `-XX:AOTCache`       |  40 |  50 |  50 | **51** |  53 |  59 |

An AOT cache also erases the gap: 73 ms → 52 ms on the same jlink image. **1 ms apart at p50 —
noise.** Confirms the diagnosis: the regression in §4.4 is entirely the missing archive, and
either mechanism restores it. **No constraint on combining jlink with AppCDS or the Leyden AOT
cache was found.**

### 4.6 Cross-version, in containers

`docker run --rm eclipse-temurin:<tag>`, Linux x64:

|                                     | **21-jdk** (21.0.12+8) | **25-jdk** (25.0.4)                   | **26-jdk** (26.0.2+10)                |
| ----------------------------------- | ---------------------- | ------------------------------------- | ------------------------------------- |
| `jmods` dir                         | **present, 69 files**  | absent                                | absent                                |
| `jlink --help` Capabilities         | _(no section)_         | `Linking from run-time image enabled` | `Linking from run-time image enabled` |
| `--compress` accepts `zip-N`        | yes                    | yes                                   | yes (help reworded)                   |
| `--compress=2`                      | warns, exit 0          | warns, exit 0                         | warns, exit 0                         |
| plain image `java -version`         | `mixed mode`           | `mixed mode`                          | `mixed mode`                          |
| plain image size                    | 45,483,865             | _(38,033,517 on Win)_                 | 49,484,359                            |
| `--generate-cds-archive` `-version` | `mixed mode, sharing`  | `mixed mode, sharing`                 | `mixed mode, sharing`                 |
| with CDS, size                      | 72,292,185 (+59%)      | _(67,328,109, +77%)_                  | 78,598,727 (+59%)                     |

**The CDS loss reproduces on every release tested, on both OSes.** It is not a JDK 25 quirk and
not a Windows quirk.

JEP 493 as a vendor choice, and its limitation:

```
# Temurin 25.0.3 (JEP 493 enabled)
$ jlink --add-modules java.base,jdk.jlink --output img-jlink
Error: This JDK does not contain packaged modules and cannot be used to create
another image with the jdk.jlink module

# GraalVM CE 25.0.2 — same JDK version, jmods present
$ jlink --add-modules java.base,jdk.jlink --output img-gvm
exit=0
img-gvm/bin/jlink.exe
$ jlink --help | grep -A2 Capabilities
Capabilities:
      Linking from run-time image disabled
```

`ALL-MODULE-PATH`, verbatim (Temurin 25.0.3):

```
$ jar --describe-module --file hello2.jar
No module descriptor found. Derived automatic module.
hello2 automatic
  requires java.base mandated
  contains com.example
  main-class com.example.Hello2

$ jlink --module-path hello2.jar --add-modules ALL-MODULE-PATH --output img-amp3
Error: automatic module cannot be used with jlink: hello2 from file:///.../hello2.jar
exit=1

$ jlink --module-path hello2.jar --add-modules hello2 --output img-amp4
Error: automatic module cannot be used with jlink: hello2 from file:///.../hello2.jar
exit=1

$ jlink --module-path hello.jar --add-modules ALL-MODULE-PATH --output img-amp
Error: Unable to derive module descriptor for hello.jar
Caused by: java.lang.module.InvalidModuleDescriptorException: Hello.class found in
top-level directory (unnamed package not allowed in module)
exit=1

$ jlink --add-modules ALL-MODULE-PATH --output img-amp2
Error: --module-path option must be specified with --add-modules ALL-MODULE-PATH
exit=2

$ jlink --add-modules ALL-DEFAULT --output img-alldef
Error: Module ALL-DEFAULT not found
exit=1
```

No class-level tree-shaking, via `jimage list`:

```
full JDK  lib/modules, java.base .class entries : 7379
jlink img lib/modules, java.base .class entries : 7372     # app uses 1 class
```

**99.9% of `java.base` survives into an image built for a one-class program.**

### 4.7 Container-layer arithmetic — does any of it show up?

Identical `Hello`, Docker 29.5.3, `docker images` size. Every image was run and printed `hello`.

| Image                                           | Base                              | Java runtime        |        Size |
| ----------------------------------------------- | --------------------------------- | ------------------- | ----------: |
| `hello-jre`                                     | `eclipse-temurin:25-jre`          | vendor JRE          |  **336 MB** |
| `hello-fulljdk`                                 | `debian:trixie-slim`              | full JDK copied in  |  **342 MB** |
| `hello-jlink`                                   | `debian:trixie-slim`              | jlink, no CDS       |  **127 MB** |
| `hello-jlinkcds`                                | `debian:trixie-slim`              | jlink + CDS archive |  **156 MB** |
| `hello-distroless`                              | `gcr.io/distroless/base-debian12` | jlink + CDS archive | **98.6 MB** |
| _(reference)_ `debian:trixie-slim`              | —                                 | —                   |     78.6 MB |
| _(reference)_ `gcr.io/distroless/base-debian12` | —                                 | —                   |     20.8 MB |
| _(reference)_ `eclipse-temurin:25-jdk`          | —                                 | —                   |      414 MB |

**Isolating jlink's own contribution** — same `debian:trixie-slim` base on both sides:
342 MB → 156 MB. **jlink saves 186 MB (54%).**
**Isolating the base-image choice** — same jlink+CDS runtime on both sides: 156 MB → 98.6 MB.
**The base saves 57.8 MB.**

I set out expecting the base image to dominate and **it does not**: jlink is the larger lever
here, by roughly 3×. That is the strongest single fact in favour of building the skill, and it
is why the verdict in §1 rests on _consequence and frequency_ rather than on denying the size
win. Note also that the base still matters — 20.8 MB of the 98.6 MB final image is distroless,
and dropping CDS to reach 127 MB/70 MB would re-buy the §4.4 startup regression.

---

## 5. Traps — how people get fooled about jlink

1. **Crediting jlink for a startup win that is CDS's.** The headline trap, and it runs
   _backwards_ from the folklore: a jlink image is **38% slower to start** than the full JDK
   until `--generate-cds-archive` is added (§4.4). Anyone who jlinked _and_ enabled AppCDS or an
   AOT cache in the same change, then measured, will attribute the improvement to jlink. The
   discriminator is one word in `java -version`: `mixed mode` versus `mixed mode, sharing`.

2. **Believing the smallest image is free.** The CDS archive costs **+29.3 MB on a 38.0 MB
   image (+77%)** (§4.3). "Smallest image" and "starts as fast as the JDK you replaced" are
   directly opposed, and nothing in the tooling surfaces the trade.

3. **Trusting `jlink --help` on the compression default.** It says "Default is zip-6"; omitting
   `--compress` measurably produces an **uncompressed** image (§3.3, §4.2). The most common
   invocation in the wild — `jlink --add-modules X --output out` — leaves 37% of the achievable
   reduction on the table while reading as if compression were on.

4. **Spending the effort on module discovery.** `jdeps` minimisation is the part everyone
   writes tutorials about and it is worth **≤20.9 MB of 303.8 MB** — all of Java SE is 54.0 MB
   against `java.base`'s 33.1 MB (§4.1). Meanwhile `--compress` alone is worth 24.1 MB and takes
   no analysis at all. Effort is inversely proportional to payoff here.

5. **Expecting GraalVM-style dead-code elimination.** jlink's granularity is the module: 7,372
   of 7,379 `java.base` classes ship for a one-class program (§4.6). People who have read about
   Native Image's points-to analysis import the intuition and are then surprised the image is
   "still 38 MB". It cannot be smaller; there is no class-level pass.

6. **Copying the `--add-modules ALL-MODULE-PATH` recipe for a non-modular app.** It cannot work:
   jlink refuses automatic modules outright (§3.5). The recipe survives because it _is_ valid
   for JDK modules, so it appears in tutorials that never put an application jar on the module
   path.

7. **Assuming "JDK 24+ has no jmods".** It is a **vendor build flag**, not a version property:
   Temurin 25.0.3 has none, GraalVM CE 25.0.2 — same version — ships them and reports
   `Linking from run-time image disabled` (§4.6). A build script that assumes either way breaks
   on the other distribution.

8. **Measuring the image and forgetting the layer under it.** Real, but _weaker than commonly
   claimed_ on this evidence: the base is 78.6 MB of a 127 MB jlink image, yet swapping
   debian-slim for distroless saves 57.8 MB against jlink's own 186 MB (§4.7). The honest form
   of this trap is not "the base dominates" but "quote the whole-image number, not the
   `/opt/jre` number" — an unqualified "our runtime is 38 MB" describes a directory nobody ships.

9. **Benchmarking startup with one run, or with a mean.** The §4.4 CDS regression is obvious at
   n=60 with disjoint supports and invisible-to-ambiguous in any single pair of runs; conversely
   the CDS-versus-full-JDK comparison looks like a 0.3 ms "win" if you report means alone, when
   it is parity.

---

## 6. Explicit UNKNOWNS

- **JDK 27 behaviour is entirely source-derived, and the sources are thin.** No JDK 27 was
  installed or containerised. The deprecation notice says only "may be removed in a future
  release"; **no removal release for `--compress=0|1|2` is published.** Do not write that it is
  removed in 27.
- **JDK 21 and 26 were exercised only in Linux containers**, not natively, and only for the
  checks in §4.6. No startup distribution was measured on either. The §4.4 timings are Windows
  x64 / Temurin 25.0.3 only.
- **No JDK 22, 23 or 24 was tested.** JEP 493's arrival is placed at 24 from the JEP and the
  Adoptium announcement, and bracketed by my executed 21-versus-25 observation. The exact first
  Temurin build is 24.0.0+36 per Adoptium; not verified by execution.
- **`--generate-cds-archive` produced no `_coh` archive** (§4.3). Whether an image built this way
  silently loses sharing under `-XX:+UseCompactObjectHeaders` was **not tested**. If the skill is
  ever built this must be measured; it is a second instance of the same silent-loss trap.
- **Runtime memory footprint was not measured at all.** No RSS, no NMT comparison between a
  jlink image and a full JDK running the same workload. The brief asked for "footprint"; every
  footprint number here is **disk and image size**. Whether a jlink image reduces RSS is
  untested and I would expect the effect to be small (the mapped `lib/modules` is demand-paged),
  but that is a hypothesis, not a measurement.
- **Startup was measured with a trivial one-class program.** A real Spring Boot application
  loads thousands of classes, where the CDS delta should be _larger_ in absolute terms, but the
  ratio is unverified. No framework workload was benchmarked.
- **No `jdeps --print-module-deps` run against a realistic multi-jar application.** It was run
  only against the trivial jar (output: `java.base`). How well it copes with reflection-heavy
  Spring dependencies — where it is known to under-report — is untested here, and
  `java-cohesion-coupling/references/metrics-and-limits.md:33` already warns that reflection
  creates edges `jdeps` never sees.
- **Process-spawn overhead on Windows is included in every §4.4 number** and is a large share of
  the ~50 ms floor. The deltas are sound; the absolute figures are not portable to Linux and
  should not be quoted as JVM startup times.
- **`upx` compression of a jlink image's `bin/` was not tested**, though `bin/` is 51% of the
  stripped image (§4.2) and `graalvm-native-image/SKILL.md:78` recommends `upx` for the
  analogous native-image case.
