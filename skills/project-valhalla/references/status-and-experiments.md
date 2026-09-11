# Status and experiment protocol

## Authority order

1. Current [Project Valhalla page](https://openjdk.org/projects/valhalla/) and JEP headers.
2. Release notes and source for the exact EA/GA build being tested.
3. Current compiler diagnostics and generated class file from that build.
4. Design notes, talks and articles, explicitly dated and labeled when historical.

Capture URL, retrieval date, JEP status/target and exact build. A proposed target can move; an
Integrated JEP in a future release is not functionality in an older supported release.

### Verified snapshot: 2026-09-05

[JEP 401: Value Objects (Preview)](https://openjdk.org/jeps/401) and
[JEP 539: Strict Field Initialization in the JVM (Preview)](https://openjdk.org/jeps/539)
both report **Integrated**, release **28**. The project page directs experiments to
[JDK 28 EA](https://jdk.java.net/28/), whose page listed build 14 dated 2026-09-03.
This is integration into an EA release line, not GA delivery or a backport to standard JDK 25/27.
Recheck these headers before repeating the status; verify inclusion in the particular binary.

The separate [Valhalla EA download page](https://jdk.java.net/valhalla/) still lists
`27-jep401ea3+1-1` dated 2026-03-11. Its JDK 27 basis does not establish a JDK 27 GA feature.
Use its documentation for that historical prototype, not current JEP syntax by assumption.
The project lists null-restricted storage, primitive integration and generic specialization
as separate work; integration of JEP 401 does not deliver all of Valhalla.

JEP 401 documents compilation with `javac --release 28 --enable-preview Main.java` and
execution with `java --enable-preview Main` on a supporting JDK 28 build. These are conditional
experiment commands, not instructions to upgrade the project. Preview class files require
the corresponding release and preview-enabled execution; do not mix compiler/runtime releases
or copy old prototype flags without checking that build.

Preview mode is itself part of the experiment. JEP 401 switches selected platform classes,
including `Integer` and `LocalDate`, to value classes when preview is enabled. An apparent
ordinary-class control using those types may therefore change before any application declaration
does. Match preview mode and dependencies between EA control/treatment, verify the actual class
forms they exercise, and record a preview-disabled platform comparison separately if relevant.
Matching only the EA binary does not isolate the application representation change.

The current proposal changes identity semantics, including `==`, but explicitly does not make
`==` a replacement for `equals`. Value fields are final; references can still point to mutable
identity objects. Null-restricted layouts and specialized generics are not implied by declaring
a value class. Test synchronization, reference/identity APIs and serialization/native integration
against the exact design rather than assuming source compatibility means behavioral compatibility.

## Experiment record

```text
question and decision:
baseline and Valhalla representation:
JDK vendor/version/build/commit, OS and architecture:
supported-JDK baseline, EA identity-class control, EA value-class treatment:
preview/compiler/runtime flags and platform-class forms in each arm:
semantic assertions:
layout evidence and flattening observation:
workload, data/access distribution and concurrency:
JMH forks/warm-up/measurement and profilers:
raw results, uncertainty and negative controls:
what the result does not prove:
```

Compare retained footprint, allocation, cache misses/bandwidth and useful latency/throughput. A
sequentially allocated object array can already have favourable locality; add randomized/scattered
access when pointer chasing is the hypothesis. Prevent setup allocation from being mistaken for
hot-path allocation, and do not attribute an unexplained tie to escape analysis without compiler or
allocation evidence.

Check that JOL, profilers, instrumentation agents and benchmark tooling support the EA class-file
format and layout. An unsupported layout probe is missing evidence, not proof of unflattened
storage. Separate retained heap, transient allocation and process memory; less allocation need
not mean a smaller retained graph. Include arrays, nullable fields, erased containers and
cross-method calls only when they occur in the proposed use, since representation can differ.

Run semantic assertions before benchmarks: compare equal field values, unequal references inside
value fields, null handling and the identity-sensitive operations the application uses. Then test
the same useful work with realistic access/locality and thread safety. A faster EA treatment does
not establish a production gain, a portable layout guarantee or compatibility of untested libraries.
