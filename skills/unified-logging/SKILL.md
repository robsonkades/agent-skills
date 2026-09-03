---
name: unified-logging
description: >
  Constructing, validating and operating HotSpot unified JVM logging: exact versus wildcard
  tag-set selection, levels, outputs, decorators, file rotation, asynchronous drop/stall
  modes, runtime VM.log changes, environment-injected options and legacy-flag migration.
  Use when -Xlog is empty, excessive, missing after restart, rejected at startup, changed
  live with jcmd, mixed with container logs, or evaluated for overhead. Producing and
  preserving the intended evidence belongs here; interpretation belongs to GC, safepoint,
  JIT, class-loading and other owning skills.
---

# Unified JVM Logging

## Purpose

Produce the intended HotSpot evidence on the exact runtime without relying on remembered
tags, defaults or diagnostic wording. Unified logging is a versioned JVM interface: tags,
call-site levels, async modes and legacy aliases change across JDK releases and vendors.

The only authoritative discovery sources for a target process are its JDK documentation,
java -Xlog:help, effective startup command/environment and jcmd help/configuration.

## Workflow

### 1. Pin and discover

Record vendor/build/version and startup option sources. Run:

```text
java -Xlog:help
java -Xlog:<selection> -version
```

The first exposes syntax/tags/decorators/output options for that build. The second proves
selection parsing, not that a workload will emit the desired events.

### 2. Select tag sets correctly

Syntax:

```text
-Xlog[:[selections][:[output][:[decorators][:output-options]]]]
selection = tag[+tag...][*][=level]
```

Without wildcard, a selection matches the exact tag set. With wildcard, it matches tag
sets containing at least those tags. Comma unions selections; plus combines tags in one
set. A level is a threshold including that level and more severe levels.

Examples:

| Selection               | Meaning                                                 |
| ----------------------- | ------------------------------------------------------- |
| gc                      | exact gc tag set at default info                        |
| gc+age=debug            | exact gc,age set through debug threshold                |
| gc*=info                | all tag sets containing gc                              |
| gc,safepoint            | exact gc OR exact safepoint, not their combined tag set |
| gc*=info,safepoint*=off | gc supersets except sets disabled by safepoint wildcard |

### 3. Prove content on a representative workload

Attach the intended output and decorators, execute behavior that triggers the subsystem, and
assert semantic content/tag sets. Exit zero and a nonempty file are insufficient; unrelated
warning lines can satisfy them. Conversely, a valid selection can be empty because no
matching call site executed or its level was below threshold.

Capture both stdout and stderr during validation. Exact diagnostic streams/wording can vary
by build and launcher environment.

### 4. Design output and retention

Choose stdout/stderr versus file from the platform collection and evidence-survival
contract. For files, define directory ownership, unique names, rotation size/count, disk
budget, restart/crash-loop behavior and collection lag. Filename placeholders such as pid,
start time and host are build-documented features.

Defaults are not retention requirements. On JDK 25 documentation, files rotate by default
with up to five rotated files around 20 MB; filecount zero disables rotation and may
overwrite an existing file. Pin and set explicit production values.

### 5. Choose sync or async from loss policy

Synchronous logging can block at log sites. Current JDK 25 supports global async modes:

- drop: bounded buffer and nonblocking log-site writes, messages can be lost;
- stall: writers wait for buffer space, preserving more evidence at latency risk.

No mode is universally safe. Size/test buffer and sink throughput, monitor drop notices,
and test shutdown/crash behavior. Do not extrapolate overhead from a different selection or
workload.

### 6. Reconfigure safely

Use jcmd target help before invoking VM.log because diagnostic command options vary:

```text
jcmd <pid> help VM.log
jcmd <pid> VM.log list
```

Snapshot before/after effective configuration, make the smallest change, trigger a known
event and restore. Runtime reconfiguration cannot be assumed equivalent to every startup
directive; test async/global behavior on the exact JDK.

### 7. Migrate legacy flags from official mapping

Classify each old option for the target JDK:

- removed/unrecognized: replace with documented -Xlog selection;
- deprecated compatibility alias: replace proactively and compare output semantics;
- still-live non-unified flag: do not translate merely because it prints diagnostics.

Use the target JDK java man page's GC/runtime mapping and test startup. Do not maintain a
cross-version status table from source snapshots as timeless truth.

## Production decision framework

Use a permanent low-volume selection when its evidence is repeatedly useful, cost is
measured and retention is bounded. Use time-boxed debug/trace capture when event rate,
sensitive content or overhead is workload-dependent. Prefer JFR when structured event
semantics, stack traces or bounded recording are better suited; the two can complement each
other.

For containers:

- stdout/stderr integrates with platform collection but can mix JVM/application schemas and
  backpressure on pipes;
- file output preserves separate parseable streams but needs a mounted durable-enough path,
  tailer and disk/rotation lifecycle;
- ephemeral container storage is not incident retention.

### Minimal decision record

```text
JDK vendor/build:
Question and owning analysis skill:
Selection and why exact/wildcard:
Output/decorators/rotation:
Sync or async mode and loss behavior:
Expected event rate/bytes and measured overhead:
Validation trigger/assertion:
Collection/retention/security:
Rollback/restoration:
```

## Failure modes

| Symptom                      | Distinguish with                                            | Response                                                |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| JVM refuses startup          | capture both streams; validate help/syntax/path/options     | correct for exact build                                 |
| warning says no tag set      | exact/wildcard semantics and suggestions/help               | select actual tag combination                           |
| empty file, no warning       | workload trigger, level, effective output/config            | exercise representative path or lower level temporarily |
| expected lines missing       | wildcard exclusions, later overrides, async drops, rotation | list effective config and inspect all files             |
| file truncated after restart | filecount/filename/restart rotation                         | explicit retention and unique placeholders              |
| container has no logs        | stdout/stderr routing, file mount/tailer, permissions       | repair platform path                                    |
| throughput/latency regresses | lines/s, bytes/s, formatting/I/O, sync/async                | narrow selection, async with known loss, remeasure      |
| live change logs too much    | omitted what/default selection or output override           | restore snapshot with explicit selection                |

## Anti-patterns

**Hard-coded “safe baseline”:** event rates and costs depend on collector, heap, workload
and call-site levels. Validate on target.

**Exact benchmark percentage as product fact:** a local 7% or 25% result is an experiment,
not transferable knowledge.

**Tags from OpenJDK source instead of product help:** product/debug builds and versions
differ.

**File exists therefore logging works:** validate expected tag/content under a trigger.

**All trace/debug is temporary by law:** some low-rate debug selections may be safe
permanently; decide from measured rate, sensitivity and value.

**Disable defaults without restoring warnings/errors:** -Xlog:disable clears the default
configuration; re-enable intended baselines explicitly.

## Cross-skill routing

- [selection syntax](references/selection-syntax.md)
- [outputs and rotation](references/outputs-and-rotation.md)
- [runtime reconfiguration](references/runtime-reconfiguration.md)
- [async and cost](references/async-and-cost.md)
- [legacy flags](references/legacy-flags.md)
- [production troubleshooting](references/production-and-troubleshooting.md)

## Authoritative references

- [JDK 25 java command: unified logging](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html#enable-logging-with-the-jvm-unified-logging-framework)
- [JEP 158: Unified JVM Logging](https://openjdk.org/jeps/158)
- [JDK 25 jcmd](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
