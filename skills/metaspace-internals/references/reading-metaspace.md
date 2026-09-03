# Reading metaspace from a live JVM

## The allocation structure the tools report on

```
MetaspaceContext (non-class; plus class context when compressed class pointers are active)
└── VirtualSpaceList / VirtualSpaceNodes — reserve address ranges from the OS
    └── root chunks — split/coalesced by the buddy-style ChunkManager
        └── Metachunks — committed in granules and assigned to MetaspaceArena
            └── metadata allocations for a ClassLoaderData

ClassLoaderData
└── one or more MetaspaceArena instances owning chunk lists and allocation cursors
```

Arena allocations are reclaimed in bulk when the owning CLD dies rather than class by class.
Loader lifetime is therefore central, but committed memory also responds to allocation rate
and shape, reusable free chunks, uncommit policy, class unloading opportunities and CDS.

## `jcmd <pid> VM.metaspace`

The right command when NMT is off (it usually is in production — the JDK Troubleshooting
Guide puts NMT at a 5–10% performance cost, and it must be enabled at start) or when the
question is specifically about chunk fragmentation. It reports, separately for `Non-Class`,
`Class` and `Both`:

- chunk counts, capacity, `committed`, `used`, `free` and `waste`
- `Virtual space` — what was actually reserved from the OS
- `Chunk freelists` — free chunks available for reuse without a new OS allocation

Growing `Chunk freelists` with flat `used` is consistent with reclaimed/reusable chunks, but
chunk splitting/coalescing and subsequent allocation also move these counters. Growing
`committed` with flat freelists does not by itself prove loaders are retained; correlate CLD
births/deaths, loaded/unloaded classes and per-loader rows.

Options on 25 (`jcmd <pid> help VM.metaspace`): `basic` prints the summary without requesting
a global safepoint on this build, but still check command impact on the target; `show-loaders` lists every CLD
with its chunks, and each non-strong hidden class appears there as its own
`<hidden class>` CLD; `show-classes` adds the class names under each loader;
`by-chunktype`, `by-spacetype`, `vslist` and `chunkfreelist` break the numbers down. The
`Internal statistics` block of `basic` includes `num_arena_births` / `num_arena_deaths` —
loaders created versus collected since start — which is the fastest confirmation that
loaders are, or are not, dying.

## `jcmd <pid> VM.native_memory summary`

Requires `-XX:NativeMemoryTracking=summary` at start. The output is **nested**, not a flat
list of categories — the `Class` category contains both metaspace halves:

```text
-                     Class (reserved=1048774KB, committed=1478KB)
                            (classes #2890)
                            (  instance classes #2583, array classes #307)
                            (mmap: reserved=1048576KB, committed=1280KB, at peak)
                            (  Metadata:   )
                            (    reserved=65536KB, committed=8512KB)
                            (    used=8409KB)
                            (    waste=103KB =1.21%)
                            (  Class space:)
                            (    reserved=1048576KB, committed=1280KB)
                            (    used=1155KB)
                            (    waste=125KB =9.77%)

-        Shared class space (reserved=16384KB, committed=14144KB, readonly=0KB)
```

- `Metadata:` is the non-class metaspace. `Class space:` is compressed class metadata; the
  shown 1 GB reservation is the verified default for this run, not a universal fixed value.
- `waste` inside `Class space:` is internal chunk fragmentation — committed but not usable
  for the next allocation. A rising percentage in an application that mints many small
  classes (proxies, lambdas, hidden classes) warrants investigation. Waste alone does not
  predict whether class space or the overall metadata allocation will fail first.
- `Shared class space` is the CDS/AppCDS contribution, mapped from the archive rather than
  materialised into metaspace.

## `jstat -gcmetacapacity <pid> 1000`

```
   MCMN       MCMX        MC       CCSMN     CCSMX     CCSC     YGC    FGC ...
       0.0  1048576.0        0.0       0.0 1048576.0       0.0      0     0 ...
```

`MCMN`/`MCMX` are min/max capacity in KB for the non-class metaspace; `CCSMN`/`CCSMX`/`CCSC`
are the same three fields for the compressed class space. All of them are **capacity**, not
usage. The counters are refreshed by internal GC accounting events, so a young process can
show `MC = 0.0` while `VM.metaspace` reports committed memory at the same instant.

## Per-loader counts

```bash
jcmd <pid> VM.classloader_stats   # loader, parent, CLD, classes, ChunkSz, BlockSz, type
jcmd <pid> VM.classloaders        # the hierarchy as a tree
```

On 25 the `classloader_stats` table adds a `+ hidden classes` sub-row under a loader when it
has any, with their own count and chunk sizes — the JDK's own lambdas (`java.lang.reflect.Proxy$$Lambda/0x…`) and method-handle `LambdaForm` classes show up
this way under the boot loader even in a trivial program. Many rows of the _same_ loader
type with similar class counts is the leak shape. Confirming that and finding the retainer
belongs to `jvm-class-loading`; deciding which generator minted the classes is
`runtime-class-generation.md`.

## JFR events (confirmed against `jfr metadata`, JDK 25)

```bash
jcmd <pid> JFR.start settings=profile duration=300s filename=metaspace.jfr
jfr print --events jdk.MetaspaceSummary,jdk.ClassLoadingStatistics metaspace.jfr
```

| Event                               | Kind                   | Use                                                         |
| ----------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `jdk.MetaspaceSummary`              | GC-boundary            | Before/after-GC metaspace state; correlate with GC timing   |
| `jdk.ClassLoadingStatistics`        | periodic               | `loadedClassCount` vs `unloadedClassCount` over time        |
| `jdk.ClassLoaderStatistics`         | chunk/end-of-recording | Per-loader snapshot, cross-checks the leak shape            |
| `jdk.MetaspaceAllocationFailure`    | one-off                | Carries `stackTrace` — points at the code loading the class |
| `jdk.MetaspaceOOM`                  | one-off                | Fires on the `OutOfMemoryError: Metaspace` itself           |
| `jdk.ClassLoad` / `jdk.ClassUnload` | one-off                | Individual loads; high volume, use a filter                 |

Never cite a JFR event name from memory — check it with `jfr metadata` first. Plausible names
that do not exist are a recurring source of wrong instrumentation.
