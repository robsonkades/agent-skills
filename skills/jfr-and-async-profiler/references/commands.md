# Capture protocols

Commands are examples, not a compatibility promise. Discover the target JDK and profiler
interfaces at runtime, pin the exact artifact used, and preserve the command plus output in the
incident manifest. Values such as duration and interval below are illustrative; derive them from
the decision, expected event opportunity, overhead budget, and incident lifetime.

## Preflight

Record before attaching:

```text
target process identity, start time, command line, UID and namespaces:
JDK vendor/version/build and container image digest:
host, cgroup/pod/container identity and resource limits:
workload phase, affected interval, traffic and completed-work denominator:
existing JFR/profiler/agent/instrumentation and destination filesystem:
free space, retention, privacy approval and abort owner:
```

Do not select a PID from an unqualified `ps` listing and assume it is the same process inside a
container namespace. Prefer the service's process metadata, then verify start time and command.
Attaching as another UID, crossing PID namespaces, or writing into an ephemeral filesystem can
fail even when the command syntax is correct.

## Discover JFR support

Use binaries from the same target JDK where possible:

```bash
jcmd <pid> help JFR.start
jcmd <pid> help JFR.check
jcmd <pid> help JFR.dump
jcmd <pid> JFR.check
jfr help
```

`jcmd` itself warns that commands can have different impact. Read the target build's help rather
than copying flags from another JDK. `JFR.check` reports recordings known to that JVM; absence is
not proof that no historical artifact or external profiler exists.

### Bounded attach recording

After deriving the settings and destination:

```bash
jcmd <pid> JFR.start name=incident settings=default duration=120s \
  filename=/durable/path/incident.jfr
jcmd <pid> JFR.check name=incident verbose=true
```

`default` is not automatically adequate or safe for every question. Inspect the effective
events, thresholds, periods, stack traces, disk mode, and path. A custom `.jfc` should be reviewed
and versioned; see `jfr-advanced`.

For an already-running recording, dump without assuming that dumping must stop it:

```bash
jcmd <pid> JFR.dump name=<recording-name> filename=/durable/path/snapshot.jfr
```

Discover whether the target supports the intended time filters and options. A dump can contain a
different interval than the incident unless start/end times are checked.

### Startup recording

When startup is the phenomenon, configure the exact target JVM rather than attaching after the
phase. One possible shape is:

```bash
java -XX:StartFlightRecording=name=startup,settings=/config/startup.jfc,\
duration=120s,filename=/durable/path/startup.jfr -jar app.jar
```

Quoting and option separators depend on the launcher, shell, manifest, and orchestration layer.
Exercise the deployed command in a representative environment. Confirm that readiness failure,
SIGTERM, restart, and disk exhaustion still leave a recoverable artifact.

## Validate JFR artifacts

Copy only after the writer has closed or a supported dump has completed. Preserve source path,
size, timestamp, capture interval, and checksum. On a trusted analysis host with a compatible JDK:

```bash
jfr summary incident.jfr
jfr metadata incident.jfr
jfr print --events jdk.CPULoad,jdk.GarbageCollection incident.jfr
```

Validation questions:

- Does the file parse and cover the intended process and wall-clock interval?
- Are the expected event types present in metadata and nonzero when a positive control ran?
- Do settings, thresholds, periods, stacks, and event counts match the question?
- Are start time, duration, time zone/clock context, JDK build, and workload markers preserved?
- Was the artifact truncated, overwritten, left in an ephemeral layer, or collected after the
  symptom disappeared?

`jfr summary` proves what is in the file, not what the workload should have emitted. Empty events
require the opportunity and positive-control analysis in `choosing-a-profile.md`.

## Acquire and discover async-profiler

Use an approved release or internally built artifact pinned by version and digest. Verify its
signature/checksum through the organization's supply-chain process. Do not pipe a network download
directly into a shell during an incident.

From the unpacked, verified distribution:

```bash
./asprof --version
./asprof list <pid>
./asprof --help
```

The available events and options depend on async-profiler version, JDK, architecture, kernel,
perf policy, container security, UID/namespace, and symbol access. `list` is evidence for that
target, not a guarantee that collection will succeed or produce trustworthy stacks.

## Bounded async-profiler examples

These examples deliberately specify duration and output. Confirm all flags against the pinned
version and write first to a durable, capacity-checked location.

CPU question:

```bash
./asprof -e cpu -d 60 -f /durable/path/cpu.jfr <pid>
```

Elapsed/off-CPU residency question:

```bash
./asprof -e wall -d 60 -f /durable/path/wall.jfr <pid>
```

Allocation-source question:

```bash
./asprof -e alloc -d 60 -f /durable/path/alloc.jfr <pid>
```

Monitor-contention question:

```bash
./asprof -e lock -d 60 -f /durable/path/lock.jfr <pid>
```

The last two do not prove retention or all waiting, respectively. Record the effective interval,
event engine, filters, stack mode, sample/weight semantics, lost/unknown frames, and tool output.
HTML is convenient for viewing; JFR or another machine-readable supported output is usually better
for repeatable comparison and artifact validation.

## Access failures are layered

Treat an attach or collection failure as a diagnostic tree:

1. Verify process identity, liveness, UID, attach policy, namespace and filesystem visibility.
2. Verify target JDK/tool/architecture compatibility and that another attach operation is not
   blocking progress.
3. Verify that the requested event engine exists on this host.
4. For perf-backed modes, inspect the actual kernel perf policy, cgroup/container restrictions,
   seccomp/LSM policy and PMU availability.
5. Verify native symbols, JIT frame information, unwind/stack mode and unknown/truncated rates.
6. Run a bounded positive control and validate output before lengthening collection.

Do not respond by granting a container every capability or changing a host-wide sysctl by default.
Prefer a supported lower-privilege engine if it answers the question. If elevated access is truly
required, use an approved short-lived diagnostic path with explicit scope, audit, rollback and
blast-radius review. An ephemeral debug container still needs correct PID namespace, UID/access,
binary compatibility, output persistence and cleanup.

## Coordinating two tools

If cross-tool timestamp alignment is necessary:

- establish process/host clocks and capture interval explicitly;
- calibrate combined overhead on the same workload and configuration;
- avoid duplicating high-rate events unless the comparison requires it;
- stagger start/stop if startup effects could contaminate both;
- retain each tool's stderr/status and effective settings;
- compare equivalent populations and weights, not just similarly named frames.

Prefer sequential captures when simultaneous correlation is unnecessary and the incident is
repeatable. Prefer simultaneous bounded capture when the state is transient and missing alignment
would destroy the inference. State that trade-off in the capture proposal.

## Artifact manifest

Store next to each artifact:

```yaml
question: ''
target:
  process_start: ''
  pid_namespace: ''
  image_digest: ''
  jdk_build: ''
tool:
  name: ''
  version_or_build: ''
  artifact_digest: ''
  exact_command: ''
capture:
  start_utc: ''
  end_utc: ''
  effective_settings: ''
  workload_phase: ''
  completed_work: ''
  positive_control: ''
  abort_condition: ''
artifact:
  path: ''
  bytes: ''
  sha256: ''
  parser_validation: ''
  loss_or_unknown_fraction: ''
```

Redact credentials and sensitive business/tenant data according to policy, but do not remove the
metadata required to establish provenance and adequacy.

## Failure tests before production use

Exercise the capture path against:

- wrong/stale PID and process restart;
- target exits or is killed during recording;
- insufficient permission or unavailable event engine;
- read-only, full, ephemeral or slow destination storage;
- no eligible events and a known positive control;
- excessive unknown/truncated stacks or event loss;
- profiler already active or overlapping recording names;
- SIGTERM, pod eviction and node replacement;
- parser/tool version mismatch and corrupt/partial transfer;
- privacy review, retention expiry and unauthorized artifact access.

Production readiness means the operator can recognize these states, abort safely, preserve the
result, and state the evidence limitations. A command that exits zero is not enough.

## Authoritative references

- [JDK `jcmd` command documentation](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [JDK Flight Recorder runtime guide](https://docs.oracle.com/en/java/javase/25/jfapi/flight-recorder-runtime-guide/index.html)
- [JDK `jfr` command documentation](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [JDK Flight Recorder API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/module-summary.html)
- [async-profiler README and command documentation](https://github.com/async-profiler/async-profiler)
- [Linux perf security documentation](https://docs.kernel.org/admin-guide/perf-security.html)
