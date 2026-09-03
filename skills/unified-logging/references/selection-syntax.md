# Selection Syntax

## Discovery

Use target java -Xlog:help. A tag existing in the list does not prove the exact one-tag set
has call sites. Validate likely combinations on a workload and use JVM suggestions/log
framework diagnostics.

## Semantics

- plus: tags belong to one unordered tag set;
- comma: union of selections;
- star: match supersets of preceding tag combination;
- equals level: threshold;
- off: disables matching selection;
- all: meta-selection for all tag sets.

Multiple -Xlog options are processed in command-line order and can override configuration
for the same output. Build the effective selection intentionally; do not concatenate flags
from independent deployment layers without a final audit.

## Selection test

```text
Question: identify class loading during startup
Discover: java -Xlog:help
Probe: java -Xlog:class+load=info -version
Representative trigger: launch actual application/module path
Assertion: expected [class,load] lines and known loaded class
Negative check: no unexpected trace-level flood
```

The probe proves syntax only. Some events occur only after application behavior, allocation,
deoptimization or an incident trigger.

## Levels

Error, warning, info, debug and trace represent increasing detail. A debug selection also
includes more severe matching messages. Call-site level can change across JDKs, so an empty
info selection may become useful at debug; measure resulting volume.
