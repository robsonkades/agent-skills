# Selection Syntax

## Discovery

Use target java -Xlog:help. A tag existing in the list does not prove the exact one-tag set
has call sites. Use JVM suggestions/log framework diagnostics and matching sources when
needed. Validate on a relevant workload when claiming its coverage; an explanation of syntax
does not itself require a new capture.

## Semantics

- plus: tags belong to one unordered tag set;
- comma: ordered selections; last matching selection determines the level for a tag set;
- star: match supersets of preceding tag combination;
- equals level: threshold;
- off: disables matching selection;
- all: meta-selection for all tag sets.

Multiple -Xlog options are processed in command-line order and can override configuration
for the same output. Build the effective selection intentionally; do not concatenate flags
from independent deployment layers without a final audit.

For HotSpot JDK 25, unmentioned tag sets retain their levels: `-Xlog:class+load=info`
followed by `-Xlog:gc=off` still enables class-load logging on stdout. Replacing an entire
output's selection requires deliberately covering its prior sets, for example with `all=off`
in the same comma-separated selection as the desired settings (`all=off,gc=info`);
preserve required warning/error coverage. Decorators and output options have different update
scopes; see [Runtime reconfiguration](runtime-reconfiguration.md).

For example, `class*=info,class+load=off` suppresses the exact class,load set;
`class+load=off,class*=info` enables it again. This ordering is implemented by
[JDK 25 LogSelectionList::level_for](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/logging/logSelectionList.cpp).
Exclusion is not permanent across later matching selections. Quote the full argument for
the target shell when wildcard or delimiter expansion could change what reaches java.

## Selection test

```text
Question: identify class loading during startup
Discover: java -Xlog:help
Probe: java -Xlog:class+load=info -version
Representative trigger: launch actual application/module path
Assertion: expected [class,load] lines and known loaded class
Negative check: no unexpected trace-level flood
```

The probe checks syntax and can also emit real startup class-load events. Credit the actual
matching records for that build/run, without treating them as evidence of application/module,
custom-loader or incident paths that were not exercised. Some events occur only after
application behavior, allocation, deoptimization or an incident trigger.

## Levels

Error, warning, info, debug and trace represent increasing detail. A debug selection also
includes more severe matching messages. Call-site level can change across JDKs, so an empty
info selection may become useful at debug; measure resulting volume.
