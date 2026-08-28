# `jlink-and-runtime-images` — not built, twice

**Status: DROPPED.** Re-tested independently on 2026-08-28 and dropped again. This note
exists so a third pass does not spend the research budget a fourth time.

## Why it keeps getting proposed

`jlink` is genuinely almost unowned: one incidental mention across 238 skills
(`simd-and-vector-api/SKILL.md:72`). A coverage-gap sweep will surface it every time.
**Absence of coverage is not justification.** The test is whether the topic changes a
decision often enough, in a way no existing skill covers.

## Why it fails that test

The consequential form of "make it smaller and start faster" is owned twice already, by
`graalvm-native-image` and `startup-cds-crac-leyden`. jlink owns the least consequential
third: **smaller, and not faster.**

Measured, 60 interleaved runs each, Temurin 25.0.3, Windows x64:

| Image                            | Startup p50 | Notes                                    |
| -------------------------------- | ----------- | ---------------------------------------- |
| Full JDK                         | 53 ms       | ships a default CDS archive              |
| jlink image                      | 73 ms       | distributions disjoint (min 69 > max 58) |
| jlink + `--generate-cds-archive` | 53 ms       | parity — never a win                     |

A jlink image ships **no default CDS archive**, so it starts slower than the JDK it was cut
from until the archive is regenerated. Every "jlink made us start faster" report is CDS's
doing. That finding was the only load-bearing content, and it now lives as a rule in
`startup-cds-crac-leyden/SKILL.md`, where the reader is already thinking about CDS.

What remains is disk image size — a build and registry cost, not an SLO, and this repository
has no container-image-build lane to put it in.

## Evidence recorded against the drop

Reported honestly by the researcher against their own conclusion: on the same
`debian:trixie-slim` base, jlink+CDS takes the image from 342 MB to 156 MB. The size win is
real and large. The drop rests on consequence and frequency, not on denying it. If this
repository ever grows a container-image lane, **reopen this decision** — that is the
condition that would change it, and nothing else here is likely to.

## Findings worth keeping regardless

- `jlink --help` misstates its own default: it says "Default is zip-6", but omitting
  `--compress` produces an **uncompressed** image (`lib/modules` 29.8 MB vs 13.9 MB).
- `--add-modules ALL-MODULE-PATH` on a non-modular application is folklore; jlink refuses
  with `Error: automatic module cannot be used with jlink`.
- No class-level tree-shaking: a one-class Hello World image still contains 7,372 of
  `java.base`'s 7,379 classes (99.9%).
- The `--compress=0|1|2` → `zip-N` syntax change was **JDK 21** (JDK-8293667), not later;
  `--compress=2` still works on 21, 25 and 26, warns, and is byte-identical to `zip-6`.
- JEP 493 (linking without JMODs) is a **vendor build choice, not a version property**:
  Temurin 25.0.3 reports it enabled with no `jmods`, while GraalVM CE 25.0.2 — same JDK
  version — ships `jmods` and reports it disabled.

Full brief: [research-brief.md](research-brief.md).
