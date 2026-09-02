# Reading metaspace from a live JVM

## The allocation structure the tools report on

```
Metaspace
└── VirtualSpaceList — regions reserved from the OS (mmap)
    └── VirtualSpace — e.g. 64 MB
        └── Chunks (1 KB … 4 MB) — the allocation unit of a VirtualSpace
            └── Metachunks — handed to one ClassLoaderData
                └── the metadata of every class loaded by that loader

ClassLoaderData (one per live ClassLoader)
├── the list of Metachunks it owns
└── a pointer to the next free position in the current chunk
```

Chunks are owned by a loader, so they are freed as a group when that loader is collected —
never per class. That is why the only lever on committed metaspace is loader lifetime.

## `jcmd <pid> VM.metaspace`

The right command when NMT is off (it usually is in production — the JDK Troubleshooting
Guide puts NMT at a 5–10% performance cost, and it must be enabled at start) or when the
question is specifically about chunk fragmentation. It reports, separately for `Non-Class`,
`Class` and `Both`:

- chunk counts, capacity, `committed`, `used`, `free` and `waste`
- `Virtual space` — what was actually reserved from the OS
- `Chunk freelists` — free chunks available for reuse without a new OS allocation

Growing `Chunk freelists` with flat `used` means loaders are being collected and space is
being recycled. Growing `committed` with flat freelists means loaders are not dying.

Options on 25 (`jcmd <pid> help VM.metaspace`): `basic` prints the summary **without a
safepoint** — the one to poll on a loaded production JVM; `show-loaders` lists every CLD
with its chunks, and each non-strong hidden class appears there as its own
`<hidden class>` CLD; `show-classes` adds the class names under each loader;
`by-chunktype`, `by-spacetype`, `vslist` and `chunkfreelist` break the numbers down. The
`Internal statistics` block of `basic` includes `num_arena_births` / `num_arena_deaths` —
loaders created versus collected since start — which is the fastest confirmation that
loaders are, or are not, dying.

## `jcmd <pid> VM.native_memory summary`

Requires `-XX:NativeMemoryTracking=summary` at start. The output is **nested**, not a flat
list of categories — the `Class` category contains both metaspace halves:

```
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

- `Metadata:` is the non-class metaspace. `Class space:` is the compressed class space, whose
  `reserved` is the 1 GB ceiling regardless of heap size.
- `waste` inside `Class space:` is internal chunk fragmentation — committed but not usable
  for the next allocation. A rising percentage in an application that mints many small
  classes (proxies, lambdas, hidden classes) is the early warning that the **class space**,
  not the metaspace total, is the ceiling that will be hit first.
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

| Event                               | Kind     | Use                                                         |
| ----------------------------------- | -------- | ----------------------------------------------------------- |
| `jdk.MetaspaceSummary`              | periodic | The cheapest time series for "metaspace only grows"         |
| `jdk.ClassLoadingStatistics`        | periodic | `loadedClassCount` vs `unloadedClassCount` over time        |
| `jdk.ClassLoaderStatistics`         | periodic | Per-loader statistics, cross-checks the leak shape          |
| `jdk.MetaspaceAllocationFailure`    | one-off  | Carries `stackTrace` — points at the code loading the class |
| `jdk.MetaspaceOOM`                  | one-off  | Fires on the `OutOfMemoryError: Metaspace` itself           |
| `jdk.ClassLoad` / `jdk.ClassUnload` | one-off  | Individual loads; high volume, use a filter                 |

Never cite a JFR event name from memory — check it with `jfr metadata` first. Plausible names
that do not exist are a recurring source of wrong instrumentation.
