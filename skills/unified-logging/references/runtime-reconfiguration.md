# Runtime Reconfiguration

## Safe procedure

For authorized discovery, identify the process and inspect its version/help/list; these reads
do not change the logging configuration. Use the subsequent change/trigger/restoration steps
only for an authorized capture or configuration change. Existing authorization for that scope
persists; do not ask again solely because the tool is jcmd.

1. identify one process unambiguously;
2. record jcmd target VM.version and help VM.log;
3. capture VM.log list;
4. apply explicit output and what selection;
5. trigger known behavior and verify content/rate;
6. time-box capture;
7. re-list current configuration and restore only this capture's changes, preserving intervening edits;
8. archive command, operator, time and output.

Do not use a broad class-name target where multiple JVMs exist. jcmd requires local
permissions/attach availability; help/list inspection, output configuration, disable and
rotation have different effects. Verify the requested command and its target.

A list snapshot is evidence, not an automatically safe rollback script. Coordinate ownership
of shared outputs and do not replay an old global configuration over another operator's
change. Runtime changes normally end with the JVM; persistence belongs in the actual launch
configuration only when the retained change is intended and authorized.

## What changes on an existing output

In [HotSpot JDK 25's configuration implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/logging/logConfiguration.cpp),
the fields have different scopes:

- `what` updates matching tag sets; unmentioned sets retain their previous levels on that output.
- `decorators` configures the whole output, including its previously enabled tag sets. An omitted
  field can select defaults; it is not a promise to preserve the prior decorator configuration.
- `output_options` applies when a file output is created. For an existing output, options such
  as `filecount`, `filesize` and `foldmultilines` are ignored with a diagnostic; the command can
  still apply its selection/decorator changes. Repeated startup `-Xlog` directives have this
  limitation too; stdout/stderr allow output options on their first startup configuration.

Do not infer that retention or framing changed from command success. Compare `VM.log list`
before/after and read diagnostics. To change those options, configure a new owned file output
with explicit settings and verify its collector handoff, or apply the change at an intended
restart. Recreating the same file output can archive/overwrite existing files and introduce a
capture gap; assess that lifecycle before closing it. `VM.log disable` clears all logging and
is not a per-output reset. Preserve unrelated outputs and required warning/error coverage.

For an isolated check, create a file with `filecount=2`, then request `filecount=4` on that
existing output while changing its selection. Verify the old count remains and inspect which
other fields changed. Compare with a new file output created with count four. This distinguishes
creation-time options from live selection changes without assuming that target help lists
every restriction. File creation/rotation behavior is in
[JDK 25 LogFileOutput](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/logging/logFileOutput.cpp).

## Hazards

- Omitting selection fields can apply defaults and broaden logging.
- Addressing an output by unstable index/name can change the wrong destination.
- Later changes to a shared output can affect existing selections/decorators.
- Rotation can overwrite evidence if collection lags.
- Debug/trace can produce denial-of-service volume.
- VM.log capabilities differ by JDK; async mode may remain startup-only.

Always trust target help over copied syntax.
