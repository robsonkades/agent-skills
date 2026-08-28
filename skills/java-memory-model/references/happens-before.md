# Happens-before rules and safe publication

## The rules that create an edge

| Rule                   | Edge                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| Program order          | earlier statement hb later statement, **within one thread only** |
| Monitor lock           | `unlock(m)` hb subsequent `lock(m)` — **same `m`**               |
| Volatile               | write to `v` hb subsequent read of `v`                           |
| Thread start           | `t.start()` hb everything in `t`                                 |
| Thread termination     | everything in `t` hb `t.join()` returning                        |
| Interruption           | `t.interrupt()` hb `t` detecting the interrupt                   |
| Final field            | construction of final fields hb publication of the reference     |
| `java.util.concurrent` | actions before placing an item hb actions after taking it        |

Everything the JMM guarantees comes from composing these. Where no chain connects a write
to a read, there is no guarantee — regardless of how the code reads.

## Piggyback publication

```java
// The anchor is volatile; the data field is not, and does not need to be
Config config;
volatile boolean initialized;

// Writer                          // Reader
config = new Config();             if (initialized) {      // read anchor first
initialized = true;                    config.get("k");    // then the data
                                   }
```

The volatile write publishes everything that preceded it on that thread. This works only
if the order is respected on both sides: data before anchor when writing, anchor before
data when reading.

Marking the _data_ field volatile instead is the common inversion, and it does not
establish the edge you need.

## Safe publication idioms

```java
// Build locally, publish once
volatile Map<String, Handler> handlers = Map.of();
void init() {
    Map<String, Handler> tmp = new HashMap<>();
    tmp.put("GET", new GetHandler());
    handlers = Map.copyOf(tmp);
}

// Genuinely concurrent mutation
final Map<String, Handler> handlers = new ConcurrentHashMap<>();
```

```java
// Do not let this escape — publish from a factory instead
final class EventListener {
    final String name;
    private EventListener(String name) { this.name = name; }

    static EventListener create(String name) {
        EventListener l = new EventListener(name);
        Registry.register(l);
        return l;
    }
}
```

## Lazy initialisation

```java
// Double-checked locking: the field MUST be volatile
private volatile Resource resource;
Resource get() {
    Resource r = resource;
    if (r == null) {
        synchronized (this) {
            r = resource;
            if (r == null) resource = r = new Resource();
        }
    }
    return r;
}

// Static holder: no volatile, no lock, no cost on the hot path
private static final class Holder { static final Resource INSTANCE = new Resource(); }
static Resource get() { return Holder.INSTANCE; }
```

Prefer the holder unless the initialisation genuinely depends on runtime state.

## x86 versus aarch64

Under TSO (x86) the only permitted reordering is **StoreLoad**: a later load can move ahead
of an earlier store. The consequence for cost is asymmetric — a volatile _read_ on x86 is
practically free, while the _write_ is not. On aarch64 both sides cost.

This is why migrating from x86 to aarch64 is an involuntary audit of your memory model.
The defects were always there; the weaker model reveals them. Validate every concurrency
fix on both.
