# Report export module

Java release: 17; no preview features or external dependencies.
The module supports PDF and HTML. Unknown supported-set misses must fail; no fallback format.
Products are stateless after construction. All state lives within a call; there are no closeable
resources or caches in this module. Format names are application-owned and closed.

The strings in this fixture are small stand-ins for format-specific marker production/consumption.
They allow ordinary Java checks of composition. They are not PDF/HTML encoders or rendering tests.

Compile: javac --release 17 -d out src/Reports.java
Inspect App and Reports as the existing caller and assembly boundary.
