# Validating a benchmark

## The checks that must pass first

- [ ] The reference (empty) method costs a few nanoseconds — if not, the environment is
      wrong, not the code
- [ ] **Proportionality test**: doubling the work roughly doubles the time. If it does not,
      something is being eliminated — and no other symptom would have shown it
- [ ] `Error` below 5% of `Score`
- [ ] `-prof comp` shows no meaningful compilation inside the measurement phase
- [ ] `-prof gc` run, and `gc.alloc.rate.norm` recorded
- [ ] The `Blackhole mode` line in the output was actually read
- [ ] For comparisons: do the intervals **decide**, or is the experiment inconclusive?

The proportionality test is the cheapest dead-code-elimination detector that exists, and
partial elimination has no other symptom.

## Anti-patterns and their corrected forms

```java
// ❌ the value is not observed → it can be eliminated
@Benchmark public void broken() throws Exception {
    mapper.writeValueAsString(obj);
}

// ✅ return it (JMH consumes it) or consume it explicitly
@Benchmark public String fixed() throws Exception {
    return mapper.writeValueAsString(obj);
}
@Benchmark public void fixedBH(Blackhole bh) throws Exception {
    bh.consume(mapper.writeValueAsString(obj));
}
```

```java
// ❌ the cost of clear() lands inside the measurement
@Setup(Level.Invocation)
public void reset() { list.clear(); }

// ✅ pre-build at Trial level and consume round-robin
@Setup(Level.Trial)
public void setup() {
    copies = new ArrayList[1024];
    for (int i = 0; i < copies.length; i++) copies[i] = new ArrayList<>(original);
}

@Benchmark
public List<Integer> sort() {
    List<Integer> l = copies[idx++ & 1023];
    Collections.sort(l);
    return l;
}
```

```java
// ❌ A measures construction + insertion; B measures insertion only
@Benchmark public void a() { new ArrayList<>(1000).add(item); }
@Benchmark public void b() { existingList.add(item); }
```

```java
// ❌ subtracting a baseline
// realTime = measured - reference;
```

Harness cost is neither additive nor independent. The empty method diagnoses the
environment; it never corrects a result arithmetically.

## Reading the interval

```
A: 42.0 ± 5.0     B: 44.0 ± 5.0
❌ "there is no difference between A and B"
✅ "this experiment does not decide; I need more data or a formal test"
```

The consequence is asymmetric and practical: accepting "no difference" is how a CI gate
approves a regression it merely lacked resolution to detect.

## Verifying warm-up

```bash
java -jar target/benchmarks.jar -prof comp MyBenchmark
```

Compilation happening inside the measurement window means either warm-up did not finish or
the code is being deoptimised mid-measurement. In both cases the number describes a
transition, not steady state.

## CI gate design

- [ ] The gate uses `gc.alloc.rate.norm` in addition to time — bytes per operation is
      deterministic, time is not
- [ ] The threshold is calibrated against the **measured variance of the pipeline itself**,
      not chosen as a round number
- [ ] `-rf json` results stored per commit, for a historical series
- [ ] The baseline is updated deliberately after an intentional optimisation, never
      automatically

## From number to decision

- [ ] The effect was converted into system impact via Amdahl, with `p` from the profiler
- [ ] The change was validated **on the real system**, not only on the bench
- [ ] The divergence between predicted and observed was explained

Without `p`, a JMH result does not convert into a prediction about the system. Measuring
the irrelevant precisely is the best-documented waste in performance work.
