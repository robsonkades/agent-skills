# Worked example: a p99 latency regression after a deploy

**Symptom.** p50 unchanged at 12 ms, p99 up from 80 ms to 400 ms after a release.
Throughput and error rate unchanged.

**Evidence collected.**

1. GC log: young collection frequency doubled, pause times unchanged.
2. Allocation profile: one endpoint's allocation went from 4 KB to 60 KB per request.
3. Diff of the release: a logging change now serialises the full request body.

**Classification.** Allocation pressure, not GC configuration. Pause _times_ did not
change; pause _frequency_ did, which points upstream of the collector.

**Fix.** Log the body only at debug level, behind an `isDebugEnabled` guard.

**Result.** Allocation back to 5 KB per request, p99 back to 85 ms.

**What did not happen.** Nobody changed a GC flag. The instinct to reach for
`-XX:MaxGCPauseMillis` would have made this worse: shrinking the pause target with an
unchanged allocation rate means more frequent collections, not fewer.
