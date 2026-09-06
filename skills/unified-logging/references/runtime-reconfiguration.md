# Runtime Reconfiguration

## Safe procedure

1. identify one process unambiguously;
2. record jcmd target VM.version and help VM.log;
3. capture VM.log list;
4. apply explicit output and what selection;
5. trigger known behavior and verify content/rate;
6. time-box capture;
7. re-list current configuration and restore only this capture's changes, preserving intervening edits;
8. archive command, operator, time and output.

Do not use a broad class-name target where multiple JVMs exist. jcmd requires local
permissions/attach availability and is a privileged operational action.

A list snapshot is evidence, not an automatically safe rollback script. Coordinate ownership
of shared outputs and do not replay an old global configuration over another operator's
change. Runtime changes normally end with the JVM; persistence belongs in the actual launch
configuration only when the retained change is intended and authorized.

## Hazards

- Omitting selection fields can apply defaults and broaden logging.
- Addressing an output by unstable index/name can change the wrong destination.
- Later changes to a shared output can affect existing selections/decorators.
- Rotation can overwrite evidence if collection lags.
- Debug/trace can produce denial-of-service volume.
- VM.log capabilities differ by JDK; async mode may remain startup-only.

Always trust target help over copied syntax.
