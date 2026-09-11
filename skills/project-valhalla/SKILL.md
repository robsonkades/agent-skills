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
   specialization, storage layout or measured performance. Identify the decision it affects;
   inspect existing workload evidence and consumer contracts before proposing a representation change.
2. Check the current JEP header, project page and target-build release notes. Record status and target
   release; never infer availability from a JEP number or old design note.
3. Inspect the project's supported Java/toolchain first. If executable behavior matters, pin the
   EA build hash/vendor/platform and preview flags, compile the smallest example and retain output.
   Use an isolated toolchain; do not change the application's supported JDK or add preview flags
   to its build merely to run an experiment. If no suitable build is available, report that limit.
4. Separate guaranteed absence of identity from optional flattening or specialization. State what
   remains implementation-dependent.
5. For a justified layout/performance experiment, measure the current supported baseline, then
   ordinary-class and value-class variants on the same EA build and preview mode. The first
   comparison includes JDK changes; the second better isolates the
   representation change. Primitive-array or Structure-of-Arrays alternatives must preserve the
   required semantics. Compare workload and layout evidence, not just allocation counts.
6. An availability/semantics question can end with a sourced answer and its limits. For migration,
   recommend retaining the current design, an isolated experiment, or a watch item with a concrete
   revisit condition. Production changes require the feature in the project's supported JDK and
   explicit acceptance of any required preview use.

## Decision rules

- Current JEP text outranks historical “State of Valhalla” notes for the active design. Historical
  terms and bytecodes must be labeled historical. For an older pinned build's actual behavior,
  consult its own sources and documentation; a newer JEP does not retroactively change that build.
- A value class is about identity semantics. It does not by itself promise flattened storage in
  every field, array, generic container or calling convention.
- An ordinary record declaration or a library's “value-based” label is not evidence of a value
  class. Check the actual build and preview mode; value-based API contracts already discourage
  relying on identity even where their implementation still has it.
- Reduced headers/indirection are analytical opportunities until the exact build's layout and
  workload are measured. Use JOL, JMH and allocation/cache evidence appropriate to that build.
- Do not claim arbitrary generic specialization or zero boxing unless the specific proposal and
  build implement it for that use.
- Migration is not semantics-neutral. Audit identity-sensitive synchronization, identity hash,
  reference equality, identity collections, nullability/default values, serialization and native
  boundaries.
- Identity-free does not mean primitive, deeply immutable, or universally interchangeable under
  domain equality. Inspect field-reference semantics, mutable referents and the proposal's
  distinction between `==` and `equals`; do not substitute operators mechanically.
- Escape analysis remains relevant to ordinary identity classes and to allocations/layouts the VM
  does not flatten. Valhalla does not make compiler evidence obsolete.

## Output

Keep verified current status, observations on a pinned EA build, inference and unresolved claims
distinct; omit unused categories for a narrow question. A performance recommendation names the
control, raw evidence, uncertainty and what would falsify it. An unexecuted experiment remains a plan.

## References

- [Status and experiment protocol](references/status-and-experiments.md) — read whenever the request
  asserts release availability, uses preview syntax or compares layout/performance.
