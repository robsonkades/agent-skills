# Production and Troubleshooting

## Permanent versus diagnostic evidence

For each selection record question, trigger frequency, level, bytes/s, sensitive content,
retention and owning analysis. Start with the smallest selection that answers the question;
expand temporarily with a rollback timer.

Do not prescribe one universal permanent set. GC, safepoint, container, class, exception
and JIT event rates/value vary by collector, workload and incident model.

## Container choice

| Destination    | Prefer when                                                                  | Risks                                           |
| -------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| stdout/stderr  | platform provides reliable collection/rotation and mixed stream is parseable | pipe backpressure, schema mixing, multiline     |
| mounted file   | separate parser/retention and volume lifecycle exist                         | disk exhaustion, tailer lag, restart collisions |
| ephemeral file | short local diagnostic copied before termination                             | evidence disappears with pod/node               |

The default warning/error output may remain on stdout alongside configured files unless
disabled/reconfigured. Capture both streams in launch validation.

## Environment-injected options

JDK_JAVA_OPTIONS, JAVA_TOOL_OPTIONS, launcher scripts, image entrypoints and _JAVA_OPTIONS
can add or override options in different order. Their use and precedence are
launcher/runtime-version concerns. Inspect the effective command/environment and VM.log
list; do not rely on one remembered precedence table across deployment wrappers.

## Triage

```text
No/incorrect unified log
  -> pin VM.version and capture stdout+stderr
  -> inspect -Xlog:help and effective option sources
  -> inspect VM.log list for live process
  -> verify exact vs wildcard tag set and level
  -> trigger representative behavior
  -> inspect output path, permissions, rotation and all files
  -> inspect async loss / sink backpressure
  -> reproduce with minimal option
```

## Security

Unified logs can expose paths, class names, command arguments, environment/resource details
and exception data. Apply least-privilege access, encryption/collection controls, bounded
retention and redaction downstream where semantics permit. Avoid enabling broad logs in
multi-tenant environments without review.
