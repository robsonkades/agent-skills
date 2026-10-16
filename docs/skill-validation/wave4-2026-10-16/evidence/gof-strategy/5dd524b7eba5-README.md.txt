# Export module

This small plain-Java module targets Java 17 and has no third-party dependencies.
Compile the Java sources into a separate output folder with `javac --release 17`.
Run `Smoke` with the path to `application.properties` as its only argument.

The registry is assembled once for the service lifetime. A service can execute
many export jobs, including jobs submitted by different callers. Configuration is
loaded at startup; there is no reload feature in scope.

