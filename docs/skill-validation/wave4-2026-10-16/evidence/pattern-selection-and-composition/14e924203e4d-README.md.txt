# Account panel fixture

Review the composition described in docs/architecture.md against the deployed read path,
the dispatcher and the available test. Preserve the accepted account-panel contract.
This is a small isolated Java 17 / H2 2.4.240 project; there is no package-manager or
production service dependency.

Run the existing smoke test from a materialized case directory:

`powershell -NoProfile -File ./run-smoke.ps1 -JdkBin <jdk-bin> -H2Jar <h2-2.4.240.jar>`

The script compiles with --release 17 and writes only its local .build directory.
The database is in memory and is shut down at the end. The test invokes the handler
directly and exercises a repeated message. The production batch entry is BatchDispatcher.
Transport and source-transaction evidence is specified in the architecture note; no
broker or source database implementation is bundled.
