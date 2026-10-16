# Annotation consumer fixture

Run `node verify.mjs` from this directory. The runner reads `project.json`, compiles with
`--release 17`, and uses the available JDK at
`C:/Users/robso/.jdks/temurin-25.0.3/bin`. Set process-local `REVIEW_JAVA_BIN` only if
that toolchain path differs. No dependency installation is needed. The compiler and
runtime actually used may be newer than the target release; report both.

The runner writes each invocation's command, stdout, stderr and exit status into a new
isolated system temporary directory printed on its first line. The fixture source stays intact.
The reader selected by the project must accept valid codec declarations, honor defaults,
and reject non-codec values, including arrays. The other reader is present for a different
integration and is outside this request's selected path.
