# Module access

Every message below was produced on Temurin 25.0.3.

## Two errors, two flags

| Access                                       | Error without the flag                                                                                               | Flag that fixes it                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Static reference: `sun.nio.ch.IOUtil.class`  | compile: `package sun.nio.ch is not visible`; run: `IllegalAccessError … because module java.base does not export …` | `--add-exports java.base/sun.nio.ch=ALL-UNNAMED` |
| Deep reflection: `field.setAccessible(true)` | `InaccessibleObjectException: Unable to make field … accessible: module java.base does not "opens java.lang" to …`   | `--add-opens java.base/java.lang=ALL-UNNAMED`    |

`--add-exports` grants compile-time and link-time access to the package's public types. It
does **not** satisfy `setAccessible` on a non-public member — executed: with only
`--add-exports java.base/java.lang=ALL-UNNAMED` the `InaccessibleObjectException` is
unchanged. `--add-opens` implies exports for the reflective case, so a library that needs deep
reflection needs the `opens` form and nothing else.

`--illegal-access=permit` is ignored with `Ignoring option --illegal-access=permit; support
was removed in 17.0`; strong encapsulation (JEP 403) is not optional on any supported JDK.

`IllegalAccessError` is a **link-time** error thrown at the first execution of the referencing
instruction, not at class load — the class loads, and the method that contains the reference
fails when it runs. That is why a module problem can surface deep into a request rather than
at startup.

## Where the flag can live

| Placement                                       | Scope                                                | Verified behaviour                                                         |
| ----------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Command line                                    | That launch                                          | Works                                                                      |
| `JDK_JAVA_OPTIONS` environment variable         | Every `java` launcher invocation in that environment | Works; the launcher prints `NOTE: Picked up JDK_JAVA_OPTIONS: …` on stderr |
| `Add-Opens` / `Add-Exports` manifest attributes | Only the main JAR launched with `java -jar`          | Works with `-jar`; **ignored** when the same JAR is run through `-cp`      |
| `@argfile`                                      | That launch                                          | Standard launcher argument file                                            |

The manifest attribute is the right home for an application that is always launched with
`-jar` — including Spring Boot's fat JAR — because it travels with the artefact. It is the
wrong home for a library: the attribute is read only from the JAR named on `-jar`, never
from dependencies. Container images that switch from `-jar` to an exploded `-cp` launch (for
layering or CDS) lose the attribute silently; the failure appears as a reflection error at
the first request that needs it.

Prefer removing the need over granting the access: JDK 17+ exposes supported replacements
for most of what `sun.*` and `jdk.internal.*` were used for (`java.lang.invoke`, FFM,
`ProcessHandle`, `Cleaner`). A required `--add-opens` is a dependency on JDK internals that
every upgrade can break — record which library needs it and why
(java-reflection-and-method-handles, jdk-upgrade-impact).

## What the module system changes in delegation

Parent-first delegation is the classpath rule. In the module system a built-in loader first
maps the **package** to a module: if the package belongs to a module defined to this loader
or a loader below it in the boot layer's mapping, that module's loader loads it directly;
only otherwise does the loader delegate to its parent. Three consequences:

- A package can live in exactly one module per layer. Two JARs on the module path that
  contain the same package fail at startup (`Package X in both module A and module B`);
  on the classpath the same situation is a silent first-wins shadowing.
- Classes in `java.base` cannot be shadowed by anything on the classpath — the boot loader
  answers for those packages before the classpath is consulted, which is the security
  property parent-first delegation was approximating.
- A `ModuleLayer` created with `defineModulesWithOneLoader` puts all of the layer's modules in
  one new loader whose parent you choose; `defineModulesWithManyLoaders` gives each module its
  own. Class identity remains `{loader, name}`: a type in a child layer is not the same type
  as the identically named one in the boot layer, and the `ClassCastException` with
  identical names applies unchanged.

For a plugin system on JDK 25, layers give what a hand-rolled child-first loader gives —
isolation and reload by discarding the layer — with the package-uniqueness check and without
having to reimplement the always-delegate list by hand. They do not change the leak rules:
the layer's loaders unload only when nothing they created is reachable
(`references/classloader-leaks.md`).
