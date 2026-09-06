# The five classes of upgrade breakage

Classify before fixing. The five have different diagnostics, different costs and different
reversibility, and treating them as one list is how an upgrade turns into a quarter.

| Class                   | Possible signal                                        | What determines the fix                          |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| 1. Retired flag         | Startup message or ignored setting                     | Replacement semantics and availability           |
| 2. Strong encapsulation | `IllegalAccessError`, `InaccessibleObjectException`    | Supported API/dependency or bounded access grant |
| 3. Removed/changed API  | Linkage error, compile error or changed runtime result | Call sites and behavioral compatibility          |
| 4. Changed default      | Effective configuration or behavior differs            | Target support, security and workload contract   |
| 5. Third-party bytecode | Failure when a library/agent reads a class             | Upstream support and compatible version range    |

Effort and reversibility depend on the actual change and deployed data/contracts, not the
category. A bytecode-tool update may be reversible; a changed default that writes incompatible
data may not be. Record that evidence instead of assigning universal time estimates.

## 1. Retired flags

Three lifecycle states have different effects; both warnings and fatal errors matter:

- **Deprecated** — starts, warns, **the flag still takes effect**.
- **Obsolete** — starts, warns, **the value is ignored**. The dangerous one: the configuration
  reads as if it applies and does not.
- **Expired or never existed** — the JVM refuses to start.

`jvm-performance-review` owns the per-flag matrix. What belongs here is the procedure: run the
production command line against the new JDK with nothing else changed, and read stderr. Two
observations that matter:

```
$ java -Djava.security.manager=allow -version          # Temurin 25.0.3
Error occurred during initialization of VM
java.lang.Error: A command line option has attempted to allow or enable the Security Manager.
```

A system property, not an `-XX` flag — so it is in a start script, a Helm chart or a Dockerfile,
not in anything a flag audit of `JVM_OPTS` would necessarily look at. Permanently disabled by
JEP 486 in JDK 24.

```
$ java --illegal-access=permit -version                # Temurin 25.0.3
OpenJDK 64-Bit Server VM warning: Ignoring option --illegal-access=permit; support was removed in 17.0
```

Starts, warns, does nothing. Anything that still works does so for a different reason —
usually an `--add-opens` elsewhere on the line.

**`-XX:+IgnoreUnrecognizedVMOptions` defeats this entire step.** With it present, an expired flag
produces no message at all and you cannot tell an effective flag from a discarded one by reading
the command line. Remove it for the compatibility pass.

## 2. Strong encapsulation

JEP 396 (JDK 16) made strong encapsulation of JDK internals the default; JEP 403 (JDK 17) removed
the ability to relax it wholesale. From 17 onwards, `--illegal-access` is inert and the only
levers are per-package.

Symptoms: `IllegalAccessError` naming a module and a package, `InaccessibleObjectException` from
a `setAccessible` call, or a reflective framework failing to initialise.

```
--add-opens java.base/java.lang=ALL-UNNAMED     # deep reflection into a package
--add-exports java.base/sun.nio.ch=ALL-UNNAMED  # compile/link against a non-exported package
```

The judgement:

- **Adding one is legitimate as a bridge.** Something you do not control has not caught up.
- **Each needs a recorded owner and reason**, because the set only grows otherwise. A dozen of
  them is not a configuration, it is an unaddressed upgrade.
- **The real fix is upstream**, or a supported replacement API — `VarHandle` for the access modes,
  the FFM API for native memory, `MethodHandles.Lookup` for the reflective cases.
- Where the dependency is dead and unreplaceable, that is an architectural decision, not a flag
  decision, and belongs in an ADR.

### `sun.misc.Unsafe` specifically

The memory-access methods were deprecated for removal by JEP 471 (JDK 23) and warn on first use
by JEP 498 (JDK 24). The switch is the useful part:

```
--sun-misc-unsafe-memory-access=allow|warn|debug|deny
```

Accepted on Temurin 25.0.3, verified. Run the test suite under `deny` to convert a warning
everyone ignores into a failure with a stack trace naming the caller — usually a library, not
your code. `debug` gives the stack trace without failing, which is the gentler first pass.

## 3. Removed or changed APIs

Loud at compile time if you compile against the new JDK, and loud at run time as
`NoSuchMethodError` or `NoClassDefFoundError` if a dependency was compiled against an older one.

The mechanical part of this class — a rename applied across many files, a package move, a
deprecated method swept repo-wide — is `refactoring-automation`, which owns doing it
reproducibly rather than by hand.

The part that is not mechanical is deciding whether the replacement has the same semantics. A
method removed in favour of another is not always a drop-in, and a compiler that accepts the
substitution has not checked behaviour.

## 4. Changed defaults

The class with no error message. Something the JVM decided for you decides differently now:
a collector, an ergonomic heap or thread count, a cipher or TLS default, a locale or charset
default, a serialization filter.

Release notes, effective configuration, contract tests and measurements expose different
default changes; absence of warnings is not evidence of compatibility. That makes step 6 of the workflow
— measuring against the pre-upgrade baseline — a compatibility step and not just a performance
one.

Where a default moved, pin the old value for comparison only if still supported and compatible
with the upgrade's purpose. Do not re-enable disabled TLS algorithms or other retired security
behavior merely to preserve a baseline. Separate optional tuning from compatibility fixes;
record required differences that prevent a pure runtime-only comparison.

## 5. Third-party bytecode

Agents, mocking frameworks, bytecode generators, proxy libraries and coverage tools parse class
files. Unsupported versions may fail at startup or later as classes are encountered; consult
the actual library/agent support matrix and exercise affected paths.

Consequences:

- **Upgrade these separately on the old JDK where supported.** Otherwise stage a validated
  combined transition; do not require a library version to run below its documented baseline.
- Their support for a new release frequently arrives after the release does. That constraint sets
  the upgrade date, and finding it early is worth more than any other item on this list.
- An APM or instrumentation agent is in this class and is usually operated by a different team.
