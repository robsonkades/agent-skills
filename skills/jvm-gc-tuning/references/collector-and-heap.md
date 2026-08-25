# GC tuning

Read this only after GC has been confirmed as the bottleneck — pause time or pause
frequency showing up directly in the latency profile.

## Collector selection

| Collector    | Choose when                                                         |
| ------------ | ------------------------------------------------------------------- |
| G1 (default) | General server workloads, heaps 4–32 GB, pause target in tens of ms |
| ZGC          | Pause time must stay sub-millisecond regardless of heap size        |
| Parallel     | Throughput matters more than pause time (batch, ETL)                |
| Serial       | Small containers, single core, short-lived processes                |

Changing collector is a bigger lever than tuning one, and a smaller lever than
reducing allocation rate. Try them in that reverse order.

## Reading the logs

Enable with `-Xlog:gc*:file=gc.log:time,uptime,level,tags`.

- **Frequent young collections with small promotion** — allocation rate is high but
  objects die young. This is usually fine; look elsewhere.
- **Frequent young collections with heavy promotion** — objects are surviving that
  should not. Look for caches with no eviction and oversized buffers.
- **Full collections** — the old generation cannot keep up. Either the live set
  genuinely grew, or promotion is too aggressive.
- **Long "to-space exhausted" pauses under G1** — the heap is too small for the
  allocation rate.

## Sizing

Set `-Xms` equal to `-Xmx` in a container. A heap that grows is a heap that pauses
while it grows, and in a fixed-size container there is nothing to give the memory
back to.

Leave headroom for non-heap memory: metaspace, code cache, thread stacks, and direct
buffers are all outside `-Xmx` and all count against the container limit.
