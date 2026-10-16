# Repository API review fixture

This is a bounded architecture review, not an application rewrite or performance diagnosis.
Read the accepted ADR, build scope, API sources, actual CLI consumer and draft review.

The high-level dependency map is a navigation aid. It is not a complete class-level graph,
a runtime profile, change history or a measured estimate of migration effort.

The fixture uses ordinary Java 17 record syntax. An existing JDK 25 compiler can check it
with `--release 17`; this does not execute a Java 17 runtime. The server's already available
dependency is Spring Data Commons 4.1.1. Do not install or upgrade anything.

Useful commands, using isolated output directories:
```text
javac --release 17 -cp <existing-spring-data-commons-4.1.1.jar> -d <api-output> src/api/demo/api/Sort.java src/api/demo/api/PageRequest.java src/api/demo/api/OrderRepository.java
javac --release 17 -cp <api-output> -d <cli-output> src/cli/demo/cli/CliPreview.java
javap -public -classpath <api-output> demo.api.PageRequest
```

Inspect the effective API and consumer prerequisites rather than declaring any compiler
failure an architectural defect by itself. This fixture contains no production workload,
transaction/session implementation or migration history. Keep generated output outside the
actor input directory.
