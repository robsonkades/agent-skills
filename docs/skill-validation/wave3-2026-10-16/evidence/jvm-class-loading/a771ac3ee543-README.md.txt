# Startup sequence fixture
Source/API target: Java 17. Keep the runtime/classpath and deployment contract unchanged.
This local diagnostic uses a deterministic in-memory Gate in place of a fallible dependency.
It runs one scan while Gate.available=false, then sets it true before active use.
Both stages use the same class definition and defining loader; no reload or process restart occurs.
The diagnostic catches Throwable only to record both observations; it is not a production error-handling template.
Review the actual initializeDuringScan configuration and Class.forName caller.
The task is a scoped diagnosis/report correction, not implementation of a production recovery mechanism.
A successful scan is not, by itself, the readiness contract.

Compile in an isolated output directory:
javac --release 17 -d out src/Gate.java src/Plugin.java src/ScanProbe.java
Run in a fresh JVM from this case directory:
java -cp out fixture.ScanProbe
Do not execute a case twice in the same JVM and infer that its class state was reset.
A newer javac --release 17 does not exercise a Java 17 runtime.
