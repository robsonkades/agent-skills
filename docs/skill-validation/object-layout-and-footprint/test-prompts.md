# Test prompts — `object-layout-and-footprint`

Ten prompts. Six should trigger the skill, two are near-misses that must route to a
neighbour instead, and two are adversarial: the correct output refuses the premise rather
than answering it as asked.

Each prompt states the expected behaviour and the specific failure it is designed to catch.

## Positive — should trigger

### P1 — the headline shape decision

> We're holding about 40 million price points in memory. Right now it's a
> `record Quote(long instrument, long ts, long bid, long ask)`. Someone wants to flatten it
> into four parallel `long[]` to save the object headers. Worth it?

**Expected.** Answers in bytes per element, not in adjectives. Establishes N is given
(40M), computes both shapes with the stated arithmetic, and reaches the measured result
that `Rec4` and `long[4]` **tie at 48 bytes** on the JDK 25/26 default because
`arrayBase` stays 16 for 8-byte elements — so "flatten it to save the header" does not save
the header. States the JDK 27 reversal. Names the build and header mode on every figure.

**Catches.** A model that reasons "arrays have less overhead" from general principle and
never checks that `long[]` keeps the 16-byte base.

### P2 — the boxed-collection bulk path

> `Map<Integer, Integer> counts` with roughly 3 million entries is showing up big in a heap
> dump. How much would we actually save moving to a primitive map?

**Expected.** Gives the measured multiple — `HashMap<Integer,Integer>` costs roughly 4.5×
the two-`long[]` form on the default header mode — with the component breakdown showing the
`HashMap$Node` and the two boxes, not a single number. Notes the `Integer` cache caveat
matters for benchmarking but not for real keys above 127.

**Catches.** Answering with a vague "primitive collections are more compact".

### P3 — the compact-header overestimate

> We're moving to JDK 27. Compact object headers are on by default there — can I budget an
> 8-byte saving per object across our heap?

**Expected.** **No**, and the reason is the rule, not a hedge: the saving is 8 only when
removing 4 header bytes crosses an 8-byte boundary. Names the zero rows that dominate real
heaps — `Integer`, `Boolean`, `String`, `ArrayList` — so a per-object multiplication
overstates. Labels JDK 27 as `[source-only]`, since it is not GA and nothing was executed
on it. Routes the flag's cost and lifecycle to `jvm-performance-review`.

**Catches.** The single most likely wrong answer in this whole topic: 8 × object count.

### P4 — reading a JOL listing that was handed over

> Someone pasted this and said our event object is 32 bytes. Is that right?
> `com.acme.Event object internals: ... instance size: 32 bytes`

**Expected.** Refuses to accept it as usable: no JDK build, no header mode, no statement of
whether it is `instanceSize` or `totalSize`. Names that the same class measures 32 or 24 by
one flag, and asks for the command line. Distinguishes shallow from deep for a class holding
references.

**Catches.** Taking a pasted number at face value — the exact failure the gate exists for.

### P5 — the JOL listing that threw

> `ClassLayout.parseClass(Quote.class).toPrintable()` is throwing on our record and I can't
> tell why.

**Expected.** Identifies it as the known record failure mode and gives the fix
(`-Djol.magicFieldOffset=true`), rather than suggesting the record is malformed.

**Catches.** Debugging the user's class instead of knowing the tool's failure modes.

### P6 — a size hand-computed from source order

> `record Point(int x, int y)` — that's 12 bytes of header plus 8 of fields, so 20?

**Expected.** 24, because of `alignUp`. Adds that declaration order is not layout order, so
offsets cannot be computed from source at all, only sizes.

**Catches.** The `header + fields` estimate the skill's Purpose names as its reason to exist.

## Near-miss — must NOT trigger; route to the neighbour

### N1 — false sharing, not footprint

> Two counters in the same object are being hammered by different threads and throughput
> collapses. Should I pad them?

**Expected.** Routes to `false-sharing-and-contended`. This is cache-line contention, and
the fact that both skills discuss headers and `@Contended` is exactly why the boundary has
to hold. Answering it here would be the scope violation the gate is watching for.

### N2 — container OOMKill, not object size

> Pod gets OOMKilled with no Java exception. `-Xmx` is set to the container limit.

**Expected.** Routes to `jvm-memory-regions` (six-region budget) and `container-awareness`.
Nothing about object layout is on the path to this answer.

## Adversarial — the correct output refuses the premise

### A1 — flags with no measurement, and no N

> Just give me the JVM flags to cut our memory usage. Don't need the analysis.

**Expected refusal.** The skill's own rule — _a per-object saving is not a heap saving until
it is multiplied by the live population_ — means the answer is a question: **what is N, and
what is the live set?** It must not emit a flag list. `-XX:+UseCompactObjectHeaders` is
evaluated for footprint with its cost and the measurement that would prove it helped, never
handed over as a default. Flag lifecycle and per-release defaults route to
`jvm-performance-review`. Naming the cheapest discriminating measurement is the deliverable.

**Catches.** The single most harmful output this suite can produce: a copyable flag list.

### A2 — a wrong causal chain, stated confidently

> Our GC pauses got worse after we added a field to our main entity. Smaller objects mean
> less GC, so if I switch to compact object headers the pauses should come back down, right?

**Expected refusal.** Two distinct errors, both named. First, **footprint is not pause
time**: object size affects the live set and allocation volume, not pause duration directly,
and the mechanism from one to the other has to be stated rather than assumed — pause
attribution belongs to `pause-attribution` and `gc-log-analysis`. Second, the proposed fix
is measured to do **nothing** for the objects most likely involved. The correct response
asks what the GC log actually shows and which measurement was taken before and after the
field was added.

**Catches.** "Smaller objects → less GC" passing unchallenged, which is the causality item
on the validation checklist.
