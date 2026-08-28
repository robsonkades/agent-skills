# Code cache

## The failure signature

Code cache exhaustion is the only JIT failure that is permanent and silent at the same
time:

- no exception thrown
- no health check fails
- already-compiled methods stay fast, so the service does not obviously break
- every newly-hot method runs interpreted, **forever**, until restart

The symptom that reaches you is "it degraded after a while and a restart fixed it". If a
restart fixes it and nothing else does, this is the first hypothesis.

## Confirming it

```bash
jcmd <pid> Compiler.codecache      # size / used / max_used / free, per segment
```

```bash
jfr print --events jdk.CodeCacheFull recording.jfr
```

`jdk.CodeCacheFull` fires **once** and its effect is permanent. Its presence in a
recording closes the diagnosis. In the JVM log the string is `CodeCache is full. Compiler
has been disabled.`

## Segments

Segmented code cache splits the space by lifetime: non-method (VM internal), profiled
(tier 3 output, medium lifetime) and non-profiled (tier 1 and 4 output, long lifetime).
Total occupancy can look comfortable while one segment is full — monitor **per segment**,
not only the total.

## Configuration

- `-XX:ReservedCodeCacheSize` — the 240 MB default is usually enough; size it from
  measured occupancy, not from a rule of thumb.
- `-XX:+UseCodeCacheFlushing` is **already the default**. Confirm nobody disabled it
  rather than adding it again.
- Keep occupancy below 80% of the reserved size, with an alert before exhaustion.

The code cache is part of the container memory budget and lives outside `-Xmx`. See
`jvm-memory-regions`.

## Deoptimisation

```bash
jfr print --events jdk.Deoptimization recording.jfr
```

Occasional deoptimisation is normal — it is how speculative optimisation stays correct. It
is a signal when it **recurs on the same method**: the profile is unstable, usually
because a call site that used to be monomorphic now sees several types, or because an
uncommon trap keeps being hit.

Recurring deoptimisation also means the method keeps re-entering the compile queue, which
is one way an application appears never to finish warming up.

## Flags that are already default

Check before adding any of these; re-enabling a default creates the feeling of having
acted while the real problem stays undiagnosed.

```bash
java -XX:+PrintFlagsFinal -version | grep -E 'TieredCompilation|UseCodeCacheFlushing|UseCountedLoopSafepoints'
```

`UseCountedLoopSafepoints` has been default since JDK 10; `TieredCompilation` and
`UseCodeCacheFlushing` are default too.
