# Reading and comparing flame graphs

## Which graph answers which question

| Symptom                     | Graph type     | How to produce it                                      |
| --------------------------- | -------------- | ------------------------------------------------------ |
| High CPU                    | CPU            | `asprof -e cpu`                                        |
| High latency, low CPU       | wall / off-CPU | `asprof -e wall -t -o jfr`, then `jfrconv -s sleeping` |
| Frequent young GC           | allocation     | `asprof -e alloc --alloc 512k`                         |
| Threads blocking each other | lock           | `asprof -e lock --lock 1ms`                            |
| Regression between versions | differential   | `difffolded.pl -n old.collapsed new.collapsed`         |

## Self-width, worked through

```
main                                   100%   ← widest, never the bottleneck
└─ handleRequest                        98%
   ├─ parseBody                         45%   ← plateau: W_self is high here
   │  └─ ObjectMapper.readValue         44%
   └─ persist                           50%
      └─ LockSupport.park               49%   ← infrastructure frame: look below it
```

`W_self(handleRequest) = 98 − 45 − 50 = 3%`. Optimising `handleRequest` itself buys 3%.
The two candidates are `ObjectMapper.readValue` (real work) and whatever is starving the
resource that `park` is waiting on (a queue, and probably not a code problem at all).

## Amdahl, correctly

```
Frame at 45%:  speedup = 1 / (1 − 0.45) = 1.82×   → 45% time reduction
Frame at  2%:  speedup = 1 / (1 − 0.02) = 1.02×   →  2% time reduction
```

The 2% frame is usually chosen first because the fix is obvious and fits in a small pull
request. It is real work with a null return, and worse, it consumes the attention window
the true bottleneck would have had.

State the conversion as **time reduction**, not as "N% faster" — the second phrasing
routinely inflates a 45% frame into an 82% claim.

## Differential

```bash
# ❌ profiles with different totals (60 s × 100 Hz vs 30 s × 100 Hz)
perl difffolded.pl v1.collapsed v2.collapsed | perl flamegraph.pl > diff.svg
# → the whole graph in one colour. That is arithmetic, not a regression.

# ✅ -n normalises, scaling the first profile to the second's total
perl difffolded.pl -n v1.collapsed v2.collapsed | perl flamegraph.pl > diff.svg
```

Normalisation corrects the total. It does not correct different load or different warm-up,
and nothing does — those have to be equal by construction.

## Colours

Colours mean whatever **that tool's** legend says. In the classic FlameGraph script they
are random warm hues carrying no meaning; in async-profiler's HTML they encode frame type
(Java, native, kernel, inlined); in a differential they encode direction of change. Reading
one tool's convention into another's output is a common source of invented findings.

## Before collecting

- [ ] Application warm by an observable criterion, not `sleep`
- [ ] Load representative in volume, operation mix and concurrency
- [ ] Dataset at production order of magnitude
- [ ] Graph type matches the symptom
- [ ] Duration enough for ~100 samples on the frame of interest
- [ ] Throughput and p50/p99/p99.9 baseline recorded
- [ ] If comparing versions: same machine, same load, same warm-up

## After the fix

- [ ] Re-profiled under identical conditions
- [ ] Differential generated **with `-n`**
- [ ] The frame shrank by the predicted proportion
- [ ] Throughput **and** percentiles compared
- [ ] No new hotspot appeared
- [ ] One fix at a time, so the gain is attributable
- [ ] Result documented: metrics and graphs, before and after

A frame that vanished is not proof of improvement — it may have been inlined. Only
throughput and percentiles settle that.
