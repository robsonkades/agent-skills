# Behaviour preservation: what "same" means, and what the compiler cannot tell you

Compiling proves nothing about behaviour, and a green suite proves only what the suite
observes. This file is the pre-flight: decide which dimensions of behaviour a step can
touch, get the evidence those dimensions need, and recognise the cases where neither the
compiler nor the tests can see the change. Contract-level compatibility — binary, source,
published API, class↔record — is `compatibility.md`, which is also the single home for
where a refactoring must stop.

## Dimensions of observable behaviour

"Same return value" is one row. Name the rows the step can touch in the commit message;
rows you do not name, you are claiming it cannot touch.

| Dimension                    | Changes silently when                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Return value                 | rounding, ordering, or a null/empty distinction is reshaped                                                                                                                                                                                  |
| Numeric promotion            | an extracted sub-expression's declared return type differs from the type it had in place — `int` arithmetic in a `long` context stops overflowing, or starts                                                                                 |
| Exception **type**           | a wrapper is added or removed; a hand-rolled check replaces a library call                                                                                                                                                                   |
| Which failure wins           | validation is reordered, or a loop is split so a later element now fails first                                                                                                                                                               |
| Side-effect **order**        | Slide Statements, Split Loop, Split Phase, moving work out of a lock or a transaction                                                                                                                                                        |
| Replay / duplicate behaviour | side effects are reordered behind an at-least-once boundary — redelivery now re-does a different prefix (idempotency, delivery-semantics)                                                                                                    |
| Number of collaborator calls | a query is hoisted out of a loop (fewer), or a temp becomes a query (more)                                                                                                                                                                   |
| Transaction boundary         | code moves across a proxy or a `@Transactional` edge; flush timing shifts                                                                                                                                                                    |
| SQL emitted                  | fetch strategy changes — snapshot timing (which rows are visible), result cardinality, and pagination (a collection `JOIN FETCH` paginates in memory); lock footprint too, but only under an explicit lock mode or a locking isolation level |
| Events emitted               | count, order or payload shape after extracting or merging a publisher call                                                                                                                                                                   |
| HTTP status / headers        | an exception type now maps to a different handler                                                                                                                                                                                            |
| Logs and metrics             | a message an alert greps for is reworded; a counter moves to a new place                                                                                                                                                                     |
| Timing                       | work moves in or out of the synchronous path                                                                                                                                                                                                 |
| Resource lifecycle           | a stream, connection or session closes at a different point                                                                                                                                                                                  |
| Identity vs equality         | a class that relied on identity equality becomes a record                                                                                                                                                                                    |
| Iteration order              | `HashMap` replaces `LinkedHashMap`; a stream is parallelised                                                                                                                                                                                 |
| Memory visibility            | a field read is cached in a local; a statement leaves a `synchronized` block                                                                                                                                                                 |

A log line an operational alert is keyed on is a contract. So is a metric on a dashboard
someone pages from, and a partition or routing key derived from a field's name or value —
changing that one splits an entity's messages across partitions and loses per-key ordering
for the whole transition (structured-logging, metrics-and-cardinality,
message-ordering-and-partitioning).

## Risk classification

**Look up the boundary the change crosses, not the technique.** The same Slide Statements
is Low inside a method body and High when it leaves a `synchronized` block; the same Move
Method is Medium between two plain classes and High when either side is a proxied bean.

| Risk       | Widest boundary crossed                                                                                                                                  | Evidence required before commit                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Low**    | One method body; only locals and one class's private state. Slide Statements only within one lock scope and one `try`                                    | Compiles; existing suite green; the diff contains no edit other than the mechanical one — no reformatting, no reordered members            |
| **Medium** | One package; every caller compiles in this build and no framework reaches the symbol by name                                                             | The above, plus the caller set closed (below), plus a characterisation row for every branch of the moved code that no existing test covers |
| **High**   | A proxy, a lock, a transaction, a persistence mapping, a serialised or wire form, a published signature, an inheritance hierarchy, or a process boundary | The above, plus the proof that matches the dimension — the table below. A green suite is never sufficient here                             |

The Low row is the one place `SKILL.md`'s "no net, no refactoring" does not bind: a step
confined to one method body, touching only locals, has no dimension a test could observe.
Everything above it needs the net first.

**Closing the caller set** takes two halves, because neither is complete alone. (a) Static
callers: reduce the symbol's visibility, or rename it to something nothing could reference,
and compile — the compiler enumerates these exhaustively and grep does not. (b)
Framework-reached names: search the old name as a **string literal** across resources, YAML,
XML, SpEL, JPQL, `@Query`, `@Value`, `@Column`, `@JsonProperty` and `Class.forName`
arguments. No tool enumerates reflective callers; the string search is the substitute, and
every hit is a caller. The exhaustive list of where a rename never reaches is
refactoring-automation's `tool-capabilities.md` — one home, do not re-derive it.

## Which proof for which dimension

| Dimension at stake                | The proof                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Published or serialised signature | An old compiled client linked against the new artefact (`compatibility.md`), and the payload exercised old-producer/new-consumer **and** new-producer/old-consumer                                                                    |
| Persistence mapping               | An integration test against the real engine with schema validation on, asserting the emitted SQL and the rows returned — not an in-memory database                                                                                    |
| Distributed call                  | The consumer's contract test run against the new provider (rpc-and-api-contracts)                                                                                                                                                     |
| Transaction boundary              | An integration test that observes the boundary itself: rollback propagates, the second write joins the first transaction, lazy access still resolves                                                                                  |
| Lock scope or memory visibility   | **Not a test.** A reviewed argument under the JMM, and `jcstress` where the claim is about a specific pair of accesses (java-memory-model). A green concurrency test is one accepted interleaving, not evidence (concurrency-testing) |

## Where the compiler and the tests both lie

**Names reached at runtime.** A rename tool traverses the AST; string-reached names are not
in it, and a `private` modifier is no protection — JPA field access and Jackson reach past
it. Close the caller set as above; the stop-line for each category is `compatibility.md`
item 4.

**Transaction and session boundaries.** Extracting a block into a method is cheap _unless
the new method is annotated_: `@Transactional` on a self-invoked method is silently ignored
by the proxy, so a `REQUIRES_NEW` added during an extraction does nothing. Extracting into a
_different bean_ usually changes nothing either — the default propagation `REQUIRED` joins
the caller's transaction. The changes are `REQUIRES_NEW` (an independent commit that
survives the outer rollback and can block on rows the outer transaction holds) and no
transaction at all (per-statement autocommit). Lazy access then throws
`LazyInitializationException` — or does not, because `open-in-view` is on by default and
keeps the session open for the whole web request, so the failure appears only in jobs,
listeners and tests. A read extracted between two writes also forces an autoflush, moving a
constraint violation from commit to mid-method. A step crossing that edge is transaction
design (enterprise-transactions), not refactoring.

**Concurrency.** Steps that look alike are not:

- Extracting the _whole body_ of a `synchronized` block into a method called from inside it
  — safe **only if the extracted method is `private` or `final` and is not itself given a
  lock**. Non-private makes the critical section overridable: an alien call under a lock.
  Re-acquiring inside is reentrant for `synchronized` and `ReentrantLock`, and a
  self-deadlock for `StampedLock` or a semaphore used as a mutex.
- Sliding a statement across a lock boundary is a lock-scope change, not a slide — in both
  directions. Outward drops protection; inward can put a blocking or alien call under a
  lock, which is a new deadlock edge.
- **Move Method and Extract Class change the monitor.** `synchronized` means `this`, so a
  moved method locks a different object and callers that were mutually excluded no longer
  are; splitting fields guarded by one lock into two objects deletes every invariant that
  spanned them and creates a lock-ordering pair. The compiler sees nothing.
- Replacing two reads of a field with one local **removes a re-read**, and the field's
  declaration decides legality. On a **`volatile`** field, a `VarHandle` acquire read or an
  `AtomicXxx.get()` it is not legal and not a refactoring: each read is a synchronisation
  action, and caching one across a loop is exactly how `while (!stopped)` becomes an
  infinite loop. On a **plain** field with no intervening synchronisation action the JIT may
  already coalesce them — the JMM owes a racy program nothing — so the local usually
  _removes_ a TOCTOU rather than adding one. The inverse, Replace Temp with Query, _adds_ a
  re-read and can yield two different values where the code assumed one.
- Lazy-init and double-checked-locking shapes tolerate almost no rearrangement: the field
  stays `volatile`, and the write to it must be the **last** step. Extracting the
  construction into a helper is safe; assigning the field and then configuring the object
  publishes a half-built one. The holder idiom removes the question.

**Stream and `Optional` laziness.** Splitting a pipeline, or extracting an intermediate
operation into a method that returns a `Stream`, changes _when_ the source is consumed and
therefore when exceptions surface and when the underlying resource is read. `orElse(x)`
evaluates `x` unconditionally where `orElseGet` does not.

**Initialisation order.** Moving a `static final` between classes changes class-init order
and can turn a working constant into a null at first access. The separate hazard of a
compile-time constant being inlined into stale callers is `compatibility.md`'s.

**Identity and publication.** `Integer` caching, interned strings and `==` on boxed types
make "equivalent" rewrites observable. The full class↔record consequence list — finality,
equality, accessor names, serialisation — is `compatibility.md`'s. One it does not carry:
record components are `final`, so class→record _adds_ safe-publication freeze and
record→class (or making a field non-final so a mapper can set it) _removes_ it. Code that
relied on `final`-field publication under a race then exposes default values, first
observably on aarch64.

## The evidence ladder

Rungs 1–2 are ordered and neither is sufficient alone. **Rungs 3–5 are not a ranking** —
they are different kinds of evidence about different dimensions, and the proof table above
says which ones are owed. Reaching rung 5 does not discharge rung 3. State the rungs
reached as a set.

1. It compiles. Establishes that every caller in this build was updated, and nothing
   whatsoever about behaviour.
2. Existing suite green. Covers only what the suite already observed.
3. Characterisation tests written **before** the step, on the changed path, pinning the
   selected dimensions (`safety-workflow.md`) — **and shown to be sensitive**: mutate the
   code about to be restructured (flip a comparison, delete a branch) and confirm a specific
   row goes red. A characterisation suite never observed failing is rung 2 wearing rung 3's
   name.
4. Differential test: keep the old implementation for one commit, generate inputs, assert
   `old(x)` equals `new(x)` over a seeded generator or jqwik. Available whenever both forms
   coexist and the computation is pure, and it finds what a hand-written row set does not
   think of — empty, null, locale, rounding mode, the trailing separator. Delete both in the
   next commit.
5. Contract evidence and dual-run, per the proof table. **Dual-run has a non-negotiable
   precondition:** the compared path is free of external side effects, or the new
   implementation's writes are routed to a sink. Running both halves of a path that writes,
   publishes, charges or sends duplicates every one of those effects — discarding the
   _result_ does not undo the _effect_. Compare a stable projection, not the object. It
   covers the real input distribution and says nothing about inputs that did not arrive, so
   rare-path behaviour still needs rung 3.

If a step's risk row demands a proof the work did not produce, the honest report is that the
refactoring is unverified — not that it is done.
