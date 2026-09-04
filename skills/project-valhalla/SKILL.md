---
name: project-valhalla
description: >
  Evaluating Project Valhalla value-class proposals and Early-Access builds without presenting
  draft syntax or flattening heuristics as released Java behavior. Use when code or documentation
  claims value classes remove identity, guarantee flattened storage, eliminate boxing, change
  object layout, or are available in a particular JDK; and when designing an experiment for a
  future migration. Does not replace current object-layout measurement
  (object-layout-and-footprint), escape-analysis diagnosis (escape-analysis-internals), or general
  JDK upgrade planning (jdk-upgrade-impact).
---

# Project Valhalla

## Purpose

Keep three questions separate: what the current proposal guarantees semantically, what a particular
EA build implements, and what layout/performance that build chooses for one workload. Valhalla is a
moving OpenJDK project; plausible syntax copied from an older design is a common source of false
guidance.

## Status-first workflow

1. Record the exact claim and whether it concerns language semantics, class-file format, library
   specialization, storage layout or measured performance.
2. Check the current JEP header, project page and target-build release notes. Record status and target
   release; never infer availability from a JEP number or old design note.
3. If executable behavior matters, pin the EA build hash/vendor/platform and preview flags, compile
   the smallest example and retain compiler/runtime output.
4. Separate guaranteed absence of identity from optional flattening or specialization. State what
   remains implementation-dependent.
5. Measure the current baseline first with ordinary classes, primitive arrays or Structure of
   Arrays. Then compare an EA variant under the same workload and layout evidence.
6. Produce a migration watch item, not production code, unless the project's supported JDK really
   contains the required feature and preview risk is explicitly accepted.

## Decision rules

- Current JEP text outranks historical “State of Valhalla” notes for the active design. Historical
  terms and bytecodes must be labeled historical.
- A value class is about identity semantics. It does not by itself promise flattened storage in
  every field, array, generic container or calling convention.
- Reduced headers/indirection are analytical opportunities until the exact build's layout and
  workload are measured. Use JOL, JMH and allocation/cache evidence appropriate to that build.
- Do not claim arbitrary generic specialization or zero boxing unless the specific proposal and
  build implement it for that use.
- Migration is not semantics-neutral. Audit identity-sensitive synchronization, identity hash,
  reference equality, identity collections, nullability/default values, serialization and native
  boundaries.
- Escape analysis remains relevant to ordinary identity classes and to allocations/layouts the VM
  does not flatten. Valhalla does not make compiler evidence obsolete.

## Output

Report `verified current status`, `observed on pinned EA build`, `inference`, and `unresolved` as
separate sections. Every performance recommendation names the control, raw evidence, confidence and
what would falsify it.

## References

- [Status and experiment protocol](references/status-and-experiments.md) — read whenever the request
  asserts release availability, uses preview syntax or compares layout/performance.
