# Compatibility: binary, source, behavioural — and where refactoring stops

Three distinct contracts break independently:

- **Binary**: existing compiled clients keep linking and running without recompilation.
  Breaks surface as linkage errors (`NoSuchMethodError`, `AbstractMethodError`, …).
- **Source**: existing client source still compiles against the new version.
- **Behavioural**: recompiled, relinked clients still observe the same behaviour. The
  hardest to see and the one tests exist for.

Inside one codebase compiled and deployed as a whole, only behavioural compatibility
matters **for Java linkage** — the compiler re-checks the other two on every build, which
is why refactoring is cheap there. Two things end that: compiled artefacts you do not
rebuild (other services' clients, plugins, anything on Maven Central), and a rolling
deploy, which runs two versions of that same deployable at once — so anything on the wire,
in a topic, in a distributed cache or in an outbox still binds in both directions.

## What breaks what

The change-kind table — which edits break binary, source or behavioural compatibility,
and the exact error a stale client sees — is java-api-design's
`references/compatibility.md`. That file is the single authoritative copy; do not
reconstruct it from memory. Two of its rows matter most mid-refactoring:

- Adding a variant to a sealed hierarchy is loud by design: source breaks at every
  exhaustive switch, and a stale compiled exhaustive switch throws `MatchException` when
  the new variant reaches it — never silent misbehaviour. That is the argument for
  refusing `default` in those switches.
- The silent rows are the ones review misses: reordering same-typed parameters and
  changing a `static final` compile-time constant (old clients keep the value inlined at
  their compile time, JLS 13.4.9) break behaviour while linking and compiling cleanly.

## Class ↔ record

Converting a class to a record is a refactoring only under all of: the class was
effectively final (records cannot be extended — existing subclasses break); equality was
already value-based (records define state-based `equals`/`hashCode` — identity-equality
users break behaviourally); accessors already followed the `x()` convention or all
callers are in-reach (a `getX()`→`x()` rename is an ordinary breaking rename); and the
type is not Java-serialised across versions (record serialisation goes through the
canonical constructor, changing the compatibility story). Inside a module with no
external consumers, all four are checkable and the conversion is routine; on a published
type it is a major-version event.

The reverse — record to class — silently _removes_ guarantees clients may depend on
(finality, state-based equality, the canonical constructor): behaviourally breaking even
where it links.

## Where a refactoring must stop

Classify the symbol before the first step:

1. **Private / package-private / internal (non-exported package of a module):** usually the
   smallest static caller set. JPMS blocks ordinary external compile-time access to a package
   absent from `exports`, but `opens`, reflection, instrumentation, generated code,
   `--add-exports`, and split or legacy class paths remain explicit exceptions. Treat
   `module-info.java` as strong evidence, not permission to ignore runtime contracts.
2. **Public within a deployable you rebuild atomically:** binary/source rows collapse;
   only behavioural rows apply. Move fast, keep the test evidence.
3. **Exported / published:** any row above marked "breaks" is no longer a refactoring —
   it is API evolution: introduce the new shape alongside, `@Deprecated(since = …)` the
   old, migrate, remove in a major release. The policy (semver, deprecation windows)
   is java-api-design's; the stop-line is this file's.
4. **Serialised, reflected, or wire-mapped:** frameworks reach names at runtime — JSON
   field names, JPA entity mappings, JPQL, discriminator values, reflective config, and
   anything already persisted in a cache or a queue in the old shape. A rename tool will
   not save you; search for the string form and treat the mapping boundary like a
   published API. Java-signature evolution from here is java-api-design's; a **wire or
   event** shape is not — that is rpc-and-api-contracts' expand → migrate → contract,
   over a window equal to the data's retention rather than the deploy's length.

At a published boundary, compile representative old source against the new artifact, then run
old compiled clients without recompiling. Failure disproves compatibility; success covers only
the clients, paths and environments exercised, so combine it with API-diff tooling and the
declared compatibility policy.
