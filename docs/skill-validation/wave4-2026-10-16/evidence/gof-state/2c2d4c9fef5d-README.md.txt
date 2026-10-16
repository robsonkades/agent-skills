# Connection callback handling

This process-local machine has accepted attempt 7 and adopted the first connection. The provider then delivers the additional callback selected by app.properties. It can refer to that adopted connection again or supply a distinct owned result. Ownership of each supplied object belongs to this machine: keep an adopted active connection open until shutdown, and release a distinct result that is not adopted. Callback delivery must not replace the accepted connection or close the active one prematurely. Every object in the shown sequence must be released exactly once by shutdown.

The caller and callback sequence in ConnectionApp.main are the complete scenario. The implementation uses identity to distinguish physical connection objects. The simple OwnedConnection is a deterministic lifecycle test double, not a network connection. There is no persistence, framework or new dependency requirement. Preserve the selected configuration, Java 21 target, accepted attempt and state behavior; fix only an evidenced problem.

Compile: javac --release 21 -d classes src/ConnectionApp.java
Run from this directory: java -cp classes ConnectionApp app.properties
