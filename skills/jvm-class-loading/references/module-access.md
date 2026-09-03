# Module access

Every message below was produced on Temurin 25.0.3.

## Two errors, two flags

| Access                                       | Error without the flag                                                                                               | Flag that fixes it                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Static reference: `sun.nio.ch.IOUtil.class`  | compile: `package sun.nio.ch is not visible`; run: `IllegalAccessError … because module java.base does not export …` | `--add-exports java.base/sun.nio.ch=ALL-UNNAMED` |
| Deep reflection: `field.setAccessible(true)` | `InaccessibleObjectException: Unable to make field … accessible: module java.base does not "opens java.lang" to …`   | `--add-opens java.base/java.lang=ALL-UNNAMED`    |

`--add-exports` grants named targets access to public types in a package (compile-time only when
the compiler receives it; run-time when the launcher receives it). It does **not** satisfy deep
reflection on non-public members. `--add-opens` grants reflective access to all types/members in
the package to its targets; it is not a general replacement for exports in ordinary static
linkage. First distinguish three gates: the caller module must **read** the target module, the
target package must be **exported** for ordinary public access, and it must be **open** for deep
reflection. Use `--add-reads`, `--add-exports`, or `--add-opens` only for the failed gate.

`--illegal-access=permit` is ignored with `Ignoring option --illegal-access=permit; support
was removed in 17.0`; strong encapsulation (JEP 403) is not optional on any supported JDK.

`IllegalAccessError` is a linkage/access-control failure. The JVMS permits many symbolic
references to resolve eagerly or lazily while constraining when an error becomes observable, so
it may surface on a request path without proving every VM resolves at “first execution”. Record
the source module, target module/package and whether the attempted access was static or deep
reflection before selecting a flag.

## Where the flag can live

| Placement                                       | Scope                                                | Verified behaviour                                                         |
| ----------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Command line                                    | That launch                                          | Works                                                                      |
| `JDK_JAVA_OPTIONS` environment variable         | Every `java` launcher invocation in that environment | Works; the launcher prints `NOTE: Picked up JDK_JAVA_OPTIONS: …` on stderr |
| `Add-Opens` / `Add-Exports` manifest attributes | Only the main JAR launched with `java -jar`          | Works with `-jar`; **ignored** when the same JAR is run through `-cp`      |
| `@argfile`                                      | That launch                                          | Standard launcher argument file                                            |

Manifest attributes can be appropriate for an application whose tested launcher contract is
always `java -jar`. They are ineffective as a transitive library request: only the executable
JAR's main manifest is launcher input. A container switching to an exploded classpath/module
launch can therefore lose the grant. Prefer eliminating internal access; otherwise keep the
minimal targeted grant in the deployment contract, test its presence, and document the owning
dependency and removal condition. `ALL-UNNAMED` broadens every classpath consumer and should not
be the default when a named target is available.

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

- A named module owns its packages, and two modules mapped to the **same loader** cannot define
  the same package. Resolution/readability also rejects relevant ambiguous exports. With
  many loaders, the same package name can denote distinct runtime packages, which restores the
  same identity/access hazards as duplicate class names. On the classpath, duplicate entries are
  commonly order-dependent shadowing rather than a module configuration error.
- Classes in `java.base` cannot be shadowed by anything on the classpath — the boot loader
  answers for those packages before the classpath is consulted, which is the security
  property parent-first delegation was approximating.
- A `ModuleLayer` created with `defineModulesWithOneLoader` puts all of the layer's modules in
  one new loader whose parent you choose; `defineModulesWithManyLoaders` gives each module its
  own. Class identity remains `{loader, name}`: a type in a child layer is not the same type
  as the identically named one in the boot layer, and the `ClassCastException` with
  identical names applies unchanged.

A module layer provides explicit configuration, readability and package/module ownership; it is
not synonymous with child-first lookup and does not by itself define a complete plugin lifecycle.
Choose one-loader-per-layer when plugin modules intentionally share a type namespace; choose
many loaders for stronger module isolation at higher delegation/identity complexity. Services
should cross via parent-owned interfaces and `ServiceLoader.load(layer, service)`. “Reload” means
building a new configuration/layer and making the old layer, its loaders, providers, threads and
TCCLs unreachable—there is no mutation or unload API for a live layer.

## Diagnostic decision table

| Evidence                                  | Gate                        | Preferred action                                                                  |
| ----------------------------------------- | --------------------------- | --------------------------------------------------------------------------------- |
| `module A does not read module B`         | Readability                 | Fix `module-info`/layer configuration; temporary `--add-reads` only with an owner |
| `module B does not export p to A`         | Ordinary public access      | Use supported exported API; narrow qualified export if B is yours                 |
| `module B does not opens p to A`          | Deep reflection             | Replace reflection or use narrow qualified `opens`; deployment override as debt   |
| `Package p in both module A and module B` | Configuration/split package | Repackage or consolidate; loader flags cannot make the layer coherent             |
| Same type name, different modules/loaders | Runtime identity            | Move the shared contract to a common parent layer/loader                          |

## Primary references

- [JVMS 25 §5.3.6, modules and layers](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html#jvms-5.3.6)
- [JVMS 25 §5.4.4, access control](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html#jvms-5.4.4)
- [Java 25 `ModuleLayer`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ModuleLayer.html)
- [Java 25 launcher options](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [JEP 403: Strongly Encapsulate JDK Internals](https://openjdk.org/jeps/403)
