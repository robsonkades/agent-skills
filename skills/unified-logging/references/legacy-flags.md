# Legacy Flag Migration

## Procedure

For the exact target JDK:

1. inventory startup scripts, env-injected options and container manifests;
2. run java option validation in CI;
3. consult that JDK's official GC/runtime mapping tables;
4. classify old flags as removed, deprecated aliases or still-live non-UL options;
5. replace one subsystem at a time;
6. compare representative old/new output where an old JDK can still run it;
7. update parsers/collectors/runbooks;
8. reject unknown/deprecated flags according to upgrade policy.

Do not assume all Print or Trace flags map one-to-one. Some information is always present,
some combines under one tag, some changes level, and some non-UL diagnostic flags remain
valid.

## CI matrix

Test every supported runtime vendor/version:

```text
java <production options> -version
java -Xlog:help
representative startup smoke test
expected output files/streams and tag assertions
```

A compatibility alias that starts successfully can still emit a warning or different
format and should not remain indefinitely.
