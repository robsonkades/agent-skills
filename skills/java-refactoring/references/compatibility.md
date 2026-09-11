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

- Adding a variant can make a recompiled switch non-exhaustive when existing cases no longer
  cover the hierarchy; a supertype case or intentional fallback can already cover it.
  A Java 21+ stale exhaustive switch can throw `MatchException` for an unhandled new variant.
  Check the actual labels and supported evolution policy, not just the `sealed` modifier.
- The silent rows are the ones review misses: reordering same-typed parameters and
  changing a `static final` compile-time constant (old clients keep the value inlined at
  their compile time, JLS 13.4.9) break behaviour while linking and compiling cleanly.

## Class ↔ record

Converting a class to a record requires checking every retained contract: records are final,
so supported subclasses cannot remain; constructor validation, mutability, equality/hash and
`toString` must match the old semantics. A label such as "value-based" is insufficient (array
components, for example, do not gain deep equality automatically). Preserve required accessors
through bridges where useful; `getX()`→`x()` alone is a breaking rename. Record reflection and
native serialization change too: deserialization invokes the canonical constructor.
An internal conversion still needs this evidence. At a published boundary, follow the actual
compatibility policy and stage any contract change; publication alone does not prove either
equivalence or a mandatory major-version change.

The reverse — record to class — requires explicitly retaining finality, component accessors,
constructor and equality behavior if those contracts must remain. A final class with final
fields can preserve those properties, but record reflection/serialization contracts still
change. Do not call every such conversion behaviorally equivalent or automatically unsafe.

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
