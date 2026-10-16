# Rendering module review snapshot

The src folder is the pending branch after adding Badge. The prototype folder is the proposed replacement; it is not approved or deployed. Each folder contains an independent, complete Java source file with a small executable check.

From either folder, use a Java toolchain that supports the project's Java 17 baseline:

    javac --release 17 -d classes RenderDemo.java
    java -cp classes RenderDemo

Inspect docs/architecture.md, docs/rendering-policy.md, docs/change-note.md and docs/change-history.csv when reviewing the proposal. The examples use fixed labels; these checks are not performance measurements.
