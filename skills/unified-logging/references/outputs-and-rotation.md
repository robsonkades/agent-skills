# Outputs, Decorators and Rotation

## Outputs

Supported target-build outputs are discovered in -Xlog:help. Standard HotSpot forms include
stdout, stderr and file paths. Validate directory existence, permissions, working directory,
container mounts and filename placeholder expansion before production.

## Decorators

Decorators add time/uptime, level, tags, process/thread and host context. Use:

- wall/UTC time for cross-process incident correlation;
- uptime for JVM-relative sequencing;
- level/tags for parsing and routing;
- pid/host when multiple processes share collection.

The framework emits decorators in its documented canonical order; do not build parsers that
depend on the order supplied in the option. Keep tags in assertions tolerant of formatting
padding.

## Rotation

Set explicit filesize and filecount from:

\[
disk\ budget \gtrsim active + rotated\ files + collection\ lag
\]

File size is a rotation target, not an exact cap. Restart, active-file archival and naming
behavior must be fixture-tested for the target JDK/filesystem. Crash loops can consume
slots rapidly. Unique pid/start-time names reduce collision but require cleanup/collection
policies.

Manual rotation and filesize zero behavior are version-documented. Verify via VM.log help
and a test process before relying on operator-triggered capture.

## Parsing

Unified logs are text and some events are multiline. foldmultilines changes framing and
escaping, with encoding caveats documented by the JDK. Test the exact collector/parser and
retain raw evidence when transformations can affect interpretation.
