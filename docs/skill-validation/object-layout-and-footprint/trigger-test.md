# Blind skill-routing trigger test

**Scope**: 240 skill packages under `skills/`, judged **only** on the `description` field of each
`SKILL.md` frontmatter. No skill bodies were read. No prior context about which skill was the
"intended" answer for any prompt.

**Method**: frontmatter extracted mechanically (text between the first two `---` lines) for all 240
packages, then each of the 12 prompts matched against the resulting index.

---

## Verdicts

| #   | Prompt (abbrev.)                                      | Chosen skill                     | Second choice                 | Conf.      | Also fires                                                                                |
| --- | ----------------------------------------------------- | -------------------------------- | ----------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| 1   | 40M `record Quote` → 4 parallel `long[]`              | `object-layout-and-footprint`    | `cpu-cache-and-numa`          | HIGH       | —                                                                                         |
| 2   | `Map<Integer,Integer>` 3M entries → primitive map     | `object-layout-and-footprint`    | `java-numeric-types`          | MEDIUM     | `heap-dump-analysis`                                                                      |
| 3   | JDK 27 compact headers default, budget 8 B/object     | `object-layout-and-footprint`    | `false-sharing-and-contended` | HIGH       | `jvm-performance-review`                                                                  |
| 4   | Pasted JOL "instance size: 32 bytes" — right?         | `object-layout-and-footprint`    | `cpu-cache-and-numa`          | HIGH       | —                                                                                         |
| 5   | `ClassLayout.parseClass(...)` throwing on a record    | `object-layout-and-footprint`    | `cpu-cache-and-numa`          | HIGH       | —                                                                                         |
| 6   | `record Point(int,int)` = 12 + 8 = 20?                | `object-layout-and-footprint`    | `cpu-cache-and-numa`          | HIGH       | —                                                                                         |
| 7   | Two counters, different threads, pad them?            | `false-sharing-and-contended`    | `cpu-cache-and-numa`          | **MEDIUM** | `lock-inflation`                                                                          |
| 8   | Pod OOMKilled, no Java exception, `-Xmx` = limit      | `jvm-memory-regions`             | `container-awareness`         | HIGH       | `off-heap-memory`, `metaspace-internals`, `linux-for-jvm`, `kubernetes-service-lifecycle` |
| 9   | "Just give me the flags to cut memory"                | `jvm-performance-review`         | `jvm-memory-regions`          | MEDIUM     | `jvm-gc-tuning`, `performance-methodology`                                                |
| 10  | Added a field → worse pauses; compact headers fix it? | `object-layout-and-footprint`    | `gc-fundamentals`             | **LOW**    | `jvm-gc-tuning`                                                                           |
| 11  | "p99 spiked. What flags should I set?"                | `jvm-performance-review`         | `java-performance`            | MEDIUM     | `tail-latency-analysis`, `performance-methodology`                                        |
| 12  | Heap climbs over days, never drops after full GC      | `java-reference-types-and-leaks` | `heap-dump-analysis`          | MEDIUM     | `gc-log-analysis`, `jvm-gc-tuning`                                                        |

---

## Per-prompt reasoning

### 1. Record vs four parallel `long[]` for 40M quotes — HIGH

`object-layout-and-footprint` matches on three independent clauses:
"a shape is chosen for a population of millions — record vs class vs primitive array vs **parallel
arrays** vs boxed collection", "when an array is proposed to **save the header**", and
"Answers in bytes per element". Nothing else in the corpus mentions parallel arrays or
header-saving as a trigger. `cpu-cache-and-numa` is a distant second on "data locality in arrays and
collections" but every one of its `Use when` clauses is about multi-threaded throughput, so it does
not actually fire. **No ambiguity.**

### 2. `HashMap<Integer,Integer>` with 3M entries — MEDIUM

`object-layout-and-footprint` names this case verbatim: "when **`HashMap<Integer,Integer>`** or
`List<Long>` is on a bulk path". But two others fire on adjacent words:

- `java-numeric-types` — "primitives versus boxed types … **boxing cost in bulk paths**".
- `heap-dump-analysis` — "Use when … a histogram is being read by shallow size"; the prompt says
  "showing up big in a heap dump".

The exclusion in `object-layout-and-footprint` actively _hurts_ here: it disclaims "sizes from a
heap dump (`heap-dump-analysis`)". A literal reader who latches onto "heap dump" in the prompt is
told to go elsewhere, even though the question asked ("how much would we save if we changed the
shape") is prospective sizing, not dump forensics. The disclaimer needs to distinguish
_measuring what exists_ from _sizing a proposed replacement_. Downgraded to MEDIUM for that reason
alone; the positive trigger is otherwise exact.

### 3. Compact object headers on by default in JDK 27 — HIGH

`object-layout-and-footprint` carries both halves: "when `-XX:+UseCompactObjectHeaders` is evaluated
**for footprint**" and "the record-versus-array answer reverses under the **JDK 27 default (JEP 534,
not yet GA)**". Two other skills name the same flag and are correctly separated by _purpose_:

- `false-sharing-and-contended` — "when `-XX:+UseCompactObjectHeaders` is weighed for its effect on
  **field adjacency**".
- `jvm-performance-review` — owns "flag lifecycle, defaults", per the explicit hand-off in
  `object-layout-and-footprint`'s own exclusion list.

The prompt says "on by default there" (a defaults question) _and_ "budget an 8-byte saving"
(a footprint question). The footprint clause is the stronger and more specific match, and the
three-way split is genuinely well drawn. This is the corpus at its best.

### 4. Pasted JOL "instance size: 32 bytes" — HIGH

"when a **JOL listing is read** or threw" — exact. Only `cpu-cache-and-numa` also says "JOL"
("object layout measured with JOL"), and its trigger conditions are all threading symptoms.
**No real ambiguity.**

### 5. `ClassLayout.parseClass(...).toPrintable()` throwing — HIGH

"when a JOL listing is read or **threw**" — the word "threw" is in the description for exactly this
case. Nothing else in 240 descriptions mentions the JOL API. **No ambiguity.**

### 6. `record Point(int,int)` = 12 + 8 = 20? — HIGH

"when a **footprint is hand-computed from headers**" — exact, and unique in the corpus.
**No ambiguity.**

### 7. Two counters hammered by different threads — should I pad? — MEDIUM ⚠️

**This is the weakest separation in the set.** Both skills fire, almost word-for-word:

- `cpu-cache-and-numa`: "**false sharing** and how it differs from lock contention … Use when
  throughput gets **worse** as threads are added … when **fields are being added to a class shared
  between threads**, when **volatile counters sit next to each other**, when **`@Contended` or
  padding is proposed**".
- `false-sharing-and-contended`: "**Proving and fixing false sharing** … `@Contended` mechanics and
  the two flags it needs, **padding strategies and their memory cost** … Use when throughput falls
  or scales sub-linearly as threads are added … when a **hot `AtomicLong` is contended**".

The prompt matches `cpu-cache-and-numa`'s trigger list _more literally_ (counters adjacent in one
object + padding proposed), while `false-sharing-and-contended` owns the deliverable the user is
asking for (should I pad, and what does it cost). The only thing separating them is a routing
sentence at the end of `cpu-cache-and-numa` — "Proving and fixing false sharing is
`false-sharing-and-contended`" — which is _not_ phrased as a trigger and is easy to miss after five
matching `Use when` clauses. `lock-inflation` also fires weakly ("throughput stops scaling as
threads are added"), though its clauses are all monitor-specific.

Chosen `false-sharing-and-contended` because the question is "should I pad", but a router picking
`cpu-cache-and-numa` here would be defensible on the descriptions alone. **The failure to separate
is the finding.**

### 8. Pod OOMKilled, no Java exception, `-Xmx` = container limit — HIGH choice, severe over-trigger ⚠️

`jvm-memory-regions` matches **both** clauses of the prompt verbatim: "Use when a pod is
**OOMKilled with no Java exception** … when **`-Xmx` is set equal to the container limit**". That
double hit settles it. But five other descriptions fire on the same symptom:

- `container-awareness` — "when a pod is **OOMKilled** while heap usage is well below Xmx, when a
  Deployment … **sets `limits.memory` equal to Xmx**"
- `off-heap-memory` — "an **OOMKilled container with no Java exception**"
- `metaspace-internals` — "when a **container is OOMKilled** with a healthy heap"
- `linux-for-jvm` — "when a process dies with **exit code 137** or no log at all"
- `kubernetes-service-lifecycle` — "when a pod **exits 137**"
- (`jhsdb-and-core-dumps` marginally — "when a container disappeared with exit code 137")

Six or seven skills fire on one two-sentence prompt. They are all cross-referenced and each
disclaims the others, so the _family_ is coherent — but a cold router with no other signal has a
one-in-six shot. `jvm-memory-regions` only wins because it repeats the prompt's second sentence
literally.

### 9. "Just give me the flags to cut memory usage. No analysis." — MEDIUM

`jvm-performance-review` explicitly claims this shape: "or a **bare request for flags** … or when
someone asks for 'flags to fix p99' — where the answer is usually a missing measurement". The
"don't need the analysis" clause is precisely what that skill exists to refuse. Competing:

- `jvm-memory-regions` — owns the memory budget the flags would target.
- `jvm-gc-tuning` — "sizing the heap … when sizing a JVM for a container".
- `performance-methodology` — "when an optimisation is proposed without a measurement".

Three-plus fire comparably; `jvm-performance-review` wins on the "bare request for flags" clause,
which is the only one describing the _request form_ rather than the subject matter.

### 10. "Smaller objects mean less GC — compact headers will fix the pauses, right?" — LOW ⚠️

**This is the closest thing to a coverage gap in the set.** The prompt contains a false causal
premise (per-object size → pause time) plus a proposed fix. Three skills each own a fragment and
none owns the whole:

- `object-layout-and-footprint` — owns compact object headers, but scopes itself to _footprint_
  ("Answers in bytes per element", "`-XX:+UseCompactObjectHeaders` is evaluated **for footprint**").
  The user is evaluating it for pauses.
- `gc-fundamentals` — owns the actual correction: "**why collection cost tracks survivors rather
  than allocation**". But its trigger clauses ("when explaining why a collection is expensive")
  are generic and never mention object size or headers.
- `jvm-gc-tuning` — owns "**deciding whether GC is the actual bottleneck**" and fires on
  "GC pauses appear on the critical path", but answers with collector choice and heap sizing,
  which is not what was asked.

No description says anything like "when reducing per-object size is expected to reduce pause time".
Chose `object-layout-and-footprint` because it is the only skill whose triggers name compact object
headers as an evaluation, but it will answer in bytes when the user asked about milliseconds.
**Recommend one clause covering the size→pause misconception, in whichever skill claims it.**

### 11. "p99 spiked this morning. What flags should I set?" — MEDIUM ⚠️

`jvm-performance-review` contains the near-literal string: "when someone asks for '**flags to fix
p99**' — where the answer is usually a missing measurement". That is decisive on wording.

But the same description also says: "**Start from `java-performance` for a symptom with no
artefact**: it routes symptoms, this reviews artefacts." This prompt _is_ a symptom with no
artefact — no command line, no manifest, no GC log was supplied. So the description's own routing
rule points away from itself while its trigger list points at itself. `java-performance` independently
fires ("a p99 regression after a deploy … and the next step is unclear"), as do
`tail-latency-analysis` ("when a p99 spike needs to be attributed to GC, safepoint, cold start or
throttling") and `performance-methodology`.

Chosen `jvm-performance-review` on the verbatim clause, but this is an **internal contradiction in
one description**, not merely competition between two.

### 12. Heap climbs over days, never drops after a full GC — MEDIUM ⚠️

`java-reference-types-and-leaks` is verbatim: "Use when **heap grows with traffic and never returns
after a full GC**". Four fire in total:

- `heap-dump-analysis` — "Use when **heap grows monotonically with uptime**"
- `gc-log-analysis` — "when the **heap floor rises after each complete collection**"
- `jvm-gc-tuning` — "when the **heap grows toward its limit**"

All four describe the same observation in four different vocabularies. The prompt supplies no
evidence artefact (no dump, no log), so nothing in the prompt selects between "here is the leak
catalogue" (`java-reference-types-and-leaks`), "take a dump" (`heap-dump-analysis`) and "read the
log" (`gc-log-analysis`). Chosen on verbatim match only; the ordering between these three is a
methodology decision the descriptions do not encode.

---

## Cross-cutting findings

### Coverage gap

**Prompt 10** — the causal claim "smaller objects ⇒ shorter GC pauses" is owned by nobody.
`object-layout-and-footprint` answers in bytes, `gc-fundamentals` holds the correction but does not
advertise it in its triggers, and `jvm-gc-tuning` answers with collectors and heap size. Any of the
three will half-answer.

Marginal note: **prompt 9** ("cut our memory usage", flags only) has no skill that owns _reducing
footprint via configuration_ as opposed to reviewing a supplied artefact — `jvm-performance-review`
fires on the request form, not the goal.

### Over-trigger (three or more comparable fires)

| Prompt | Competing skills                                                                                                                                                 | Cause                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8      | `jvm-memory-regions`, `container-awareness`, `off-heap-memory`, `metaspace-internals`, `linux-for-jvm`, `kubernetes-service-lifecycle` (+`jhsdb-and-core-dumps`) | Six skills replicate the "OOMKilled / exit 137 / no Java exception" symptom as a trigger. Correct as a family; unusable as a discriminator.             |
| 12     | `java-reference-types-and-leaks`, `heap-dump-analysis`, `gc-log-analysis`, `jvm-gc-tuning`                                                                       | The same observation phrased four ways ("never returns after a full GC" / "monotonically with uptime" / "heap floor rises" / "grows toward its limit"). |
| 9, 11  | `jvm-performance-review`, `java-performance`, `jvm-gc-tuning`/`tail-latency-analysis`, `performance-methodology`                                                 | "Give me flags" is claimed by the artefact reviewer, the symptom router, and the process skill at once.                                                 |
| 2      | `object-layout-and-footprint`, `java-numeric-types`, `heap-dump-analysis`                                                                                        | Boxed-collection footprint sits on a three-way seam: sizing, numeric types, dump forensics.                                                             |
| 10     | `object-layout-and-footprint`, `gc-fundamentals`, `jvm-gc-tuning`                                                                                                | See coverage gap.                                                                                                                                       |

### Pairs genuinely hard to tell apart

**1. `cpu-cache-and-numa` vs `false-sharing-and-contended`** (prompt 7) — the worst of the set.

> `cpu-cache-and-numa`: "false sharing and how it differs from lock contention, **object layout
> measured with JOL** … when **volatile counters sit next to each other**, when **`@Contended` or
> padding is proposed**"
>
> `false-sharing-and-contended`: "**Proving and fixing false sharing** … **`@Contended` mechanics**
> and the two flags it needs, **padding strategies and their memory cost** … when a hot `AtomicLong`
> is contended"

Both claim `@Contended` and padding as triggers. The split (introduction vs proof-and-fix) exists
only in a trailing routing sentence, not in the trigger clauses.

**2. `jvm-memory-regions` vs `container-awareness` vs `off-heap-memory`** (prompt 8).

> `jvm-memory-regions`: "when a pod is **OOMKilled with no Java exception** … when **`-Xmx` is set
> equal to the container limit**"
>
> `container-awareness`: "when a pod is **OOMKilled** while heap usage is well below Xmx … or
> **sets `limits.memory` equal to Xmx**"
>
> `off-heap-memory`: "an **OOMKilled container with no Java exception**"

Three descriptions, one symptom sentence, near-identical wording.

**3. `jvm-performance-review` vs `java-performance`** (prompts 9 and 11) — a _self_-contradiction.
`jvm-performance-review` claims "a bare request for flags" and "flags to fix p99", then in the same
paragraph says "Start from `java-performance` for a symptom with no artefact". Prompt 11 is both.

**4. `java-reference-types-and-leaks` vs `heap-dump-analysis`** (prompt 12).

> "heap grows with traffic and **never returns after a full GC**" vs "heap grows **monotonically
> with uptime**"

Same symptom, no stated tiebreak; the real distinction (do you have a dump yet?) is not in either
trigger list.

**5. `object-layout-and-footprint` vs `heap-dump-analysis`** (prompt 2) — created by an _exclusion_
rather than a trigger: "Not … sizes from a heap dump (`heap-dump-analysis`)". A prospective sizing
question that merely _mentions_ a heap dump gets pushed away by that clause.

### What worked well

Prompts 1, 3, 4, 5 and 6 route to `object-layout-and-footprint` with essentially zero contest. Its
description carries unusually specific, low-collision trigger tokens — "parallel arrays",
"save the header", "`HashMap<Integer,Integer>`", "hand-computed from headers", "a JOL listing is
read **or threw**", "JEP 534" — and each one is unique or near-unique across all 240 descriptions.
The `-XX:+UseCompactObjectHeaders` three-way split (footprint / field adjacency / flag defaults)
across `object-layout-and-footprint`, `false-sharing-and-contended` and `jvm-performance-review` is
a model of how to share a keyword without colliding: each names the _purpose_, not just the flag.
