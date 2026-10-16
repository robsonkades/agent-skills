# Quote acceptance preview
The branch introduces a small domain event and a deferred consumer.
PreviewTrace.java is a dependency-free reproduction of the event/data flow.
MemoryRepository is only a fixture; it does not establish production commit, isolation,
or recovery behavior. It copies immutable rows so later amendments are separate rows.

Reproduce with an available Java 17-compatible compiler/runtime:
javac --release 17 -d classes PreviewTrace.java
java -cp classes PreviewTrace

The trace has no golden expected total; compare it with the approved preview contract.
