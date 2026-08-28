# Build and measurement recipes

## Collecting reachability metadata with the agent

The agent records reflection, resources, serialisation, proxies and JNI as they happen on a
normal JVM. It does not infer — it only registers what actually ran.

```bash
# 1. Run the application under the agent, on a normal JVM
java -agentlib:native-image-agent=config-output-dir=META-INF/native-image \
     -jar myapp.jar

# 2. Exercise EVERY relevant path:
#    - the whole integration test suite
#    - every endpoint, with payload variation
#    - edge cases: errors, timeouts, invalid input

# 3. Build with the collected configuration
native-image -jar myapp.jar --no-fallback \
    -H:ReflectionConfigurationFiles=META-INF/native-image/reflect-config.json
```

Files the agent writes in the legacy format:

```
META-INF/native-image/
  reflect-config.json
  proxy-config.json
  resource-config.json
  serialization-config.json
  jni-config.json
```

Running the agent against a single trivial request — a health check — produces a
`reflect-config.json` that looks complete and is not. Every unexercised path throws at run
time, in production.

## Build diagnostics

```bash
# What went into the binary, and what did not
native-image -jar myapp.jar \
    --verbose \
    -H:+PrintAnalysisCallTree \
    -H:PrintAnalysisStatisticsFile=analysis-stats.json

# Binary composition by class
native-image -jar myapp.jar \
    -H:+PrintImageObjectTree \
    -H:ImageObjectTreeExpandAllClasses=true

# Build time and resulting size
time native-image -jar myapp.jar
ls -lh myapp
```

Before using any `-H:` option copied from a forum or older material:

```bash
native-image --help-extra | grep -i <term>
```

If it does not appear, it does not exist in this version — or never existed as a public
hosted option.

## Garbage collector

```bash
# Serial GC: the Native Image default, smallest footprint, stop-the-world.
# Available in both distributions.
native-image -jar myapp.jar --gc=serial

# G1: shorter pauses on larger heaps. REQUIRES Oracle GraalVM.
# On Community Edition this fails at build initialisation, not at run time.
native-image -jar myapp.jar --gc=G1 -H:G1HeapRegionSize=1m
```

| Feature                | Flag                    | GraalVM CE | Oracle GraalVM |
| ---------------------- | ----------------------- | ---------- | -------------- |
| Serial GC              | `--gc=serial` (default) | Yes        | Yes            |
| Epsilon GC             | `--gc=epsilon`          | Yes        | Yes            |
| G1 GC                  | `--gc=G1`               | **No**     | Yes            |
| PGO instrumented build | `--pgo-instrument`      | **No**     | Yes            |
| PGO optimised build    | `--pgo=<profile>`       | **No**     | Yes            |

Confirm with `native-image --version` — the output identifies the distribution — before
spending time debugging a "PGO error" that is really the wrong distribution.

## Profile-guided optimisation

```bash
# Requires Oracle GraalVM.
# 1. Instrumented build
native-image --pgo-instrument -jar myapp.jar -o myapp-instrumented

# 2. Run under representative load and collect the profile
./myapp-instrumented --profile-output=profile.iprof
#    Run a real workload long enough to cover the hot paths

# 3. Final build consuming the profile
native-image --pgo=profile.iprof -jar myapp.jar -o myapp-optimized
```

PGO gives the ahead-of-time compiler the kind of information the JIT would gather at run
time: real branch frequencies, hot call sites to prioritise for inlining, data-driven code
layout instead of static heuristics. GraalVM's own material cites roughly 10-30% throughput
over a build without PGO — treat that as an order of magnitude, and compare with and without
the profile on the same base build.

## Build optimisation and binary size

```bash
native-image -O3 -jar myapp.jar          # maximum optimisation, slower build
native-image -Ob -jar myapp.jar          # quick build, less optimisation — dev loop

native-image -jar myapp.jar --strip-debug -o myapp
upx --best myapp                          # real compression is a post-build step
```

There is no public `-H:+CompressEncoding` hosted option; that name belongs to an internal
Graal compiler class.

## Framework builds

```bash
./mvnw package -Dpackaging=native-image   # Micronaut
./mvnw package -Pnative                   # Quarkus
./mvnw -Pnative native:compile            # Spring Boot 3.x/4.x, via
                                          # org.graalvm.buildtools:native-maven-plugin
mvn package -Pnative-image                # Helidon
```

For Spring Boot, confirm the `native-maven-plugin` version compatible with the Boot line
before pinning it — the plugin evolves alongside both 3.x and 4.x.

## Measuring startup, RSS and throughput

```bash
# Startup — identical methodology on both sides, multiple repetitions
time java -jar myapp.jar --dry-run
time ./myapp --dry-run

# Memory — stabilised RSS, not the transient startup peak
java -jar myapp.jar &
PID=$!; sleep 5
grep VmRSS /proc/$PID/status

./myapp &
PID=$!; sleep 5
grep VmRSS /proc/$PID/status

# Throughput — compare STEADY STATE to STEADY STATE
wrk -t4 -c100 -d60s http://localhost:8080/api   # JVM, after warm-up
wrk -t4 -c100 -d60s http://localhost:8080/api   # native, no warm-up to wait for
```

Fix heap sizing explicitly on both sides (`-Xmx`/`-Xms` on the JVM; the SubstrateVM heap
flags on the binary, which also accepts `-Xmx`). A JVM at its default `-Xmx` typically
reserves and commits more than it uses, and an untuned native run-time heap can surprise in
either direction — comparing the two defaults measures the defaults, not the technology.

## Checklists

**Before building**

- [ ] Every reflection, proxy, serialisation, JNI and resource path identified — by agent
      run with full coverage, or from published third-party metadata
- [ ] `--no-fallback` present, so closed-world failures are explicit rather than silently
      turned into a fallback image
- [ ] Static initializers with environment-dependent side effects identified and moved to
      run time
- [ ] Installed distribution confirmed against the features the build uses (G1, PGO)

**During the build**

- [ ] The analysis report inspected at least once, to confirm nothing essential was
      eliminated by mistake
- [ ] Every `-H:` option confirmed with `native-image --help-extra` on the version in use

**When measuring**

- [ ] Startup and RSS measured with identical methodology on both sides — same request, same
      repetitions, heap fixed explicitly on both
- [ ] Peak throughput measured under load sustained long enough for the comparison JVM to
      reach its own steady state
- [ ] PGO results compared with and without the profile on the same base build

**In production**

- [ ] Observability does not depend on VM-internal JFR events absent in Native Image, nor
      assume remote JMX or `jcmd` on Windows
- [ ] A rollback plan to the traditional JVM exists for an uncovered reflection path
