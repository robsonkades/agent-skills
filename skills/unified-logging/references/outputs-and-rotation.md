# Outputs, Decorators and Rotation

## Outputs

Supported target-build outputs are discovered in -Xlog:help. Standard HotSpot forms include
stdout, stderr and file paths. Validate directory existence, permissions, working directory,
container mounts and filename placeholder expansion before production.

For JDK 25 file output, `%p`, `%t` and `%hn` expand to PID, startup timestamp and host name.
They are not the decorator names `pid`, `time` or `hostname`. Pin this behavior to target
help/source; do not infer another release's placeholders from its decorator list.

Keep the complete `-Xlog` argument intact through the launcher and shell. Spaces and an
absolute Windows drive colon can require quoting at different parsing layers; verify the
actual argument and created path rather than guessing an escape sequence. A relative path
under an owned disposable working directory avoids the drive-colon ambiguity for a probe.
Even `-version` can create, rotate or overwrite files. Names with these placeholders can
still collide after PID reuse/restart or with shared host identities; collection and cleanup
remain separate responsibilities.

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
behavior needs relevant evidence before a retention guarantee; reuse adequate target
JDK/filesystem fixtures. A filename syntax explanation need not run a crash loop. Crash loops can consume
slots rapidly. Unique pid/start-time names reduce collision but require cleanup/collection
policies.

Manual rotation and filesize zero behavior are version-documented. Verify via VM.log help
and a test process before relying on operator-triggered capture.

## Parsing

Unified logs are text and some events are multiline. foldmultilines changes framing and
escaping, with encoding caveats documented by the JDK. Test the exact collector/parser and
retain raw evidence when transformations can affect interpretation.
