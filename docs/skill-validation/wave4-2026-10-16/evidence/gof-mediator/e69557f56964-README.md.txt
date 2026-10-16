# Capture feature fixture

Compile target Java17; no preview or dependencies.
Compile sources with javac --release 17 -d out src/*.java.
The source includes a small local driver/view boundary and two completion-delivery implementations.
Read Assembly.java to determine which delivery this deployment selects.

The manual delivery drain exists for deterministic local execution. These sources are not a
physical driver integration and contain no external side effects. Only one capture is admitted.
