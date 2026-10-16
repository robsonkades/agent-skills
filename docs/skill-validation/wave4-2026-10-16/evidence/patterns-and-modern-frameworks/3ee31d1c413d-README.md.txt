# Catalog cache integration review fixture

Java 17 language/API baseline, Spring Framework 6.2.10. Sources are partial application fixtures with real Spring caching/proxy/transaction infrastructure. SandboxTransactionManager exercises Spring synchronization only; it does not persist data or simulate database isolation.

Run the Smoke main class with the dependencies in pom.xml. The current smoke covers the successful path. Do not install or upgrade dependencies for this review. Inspect the supplied contracts and configuration; add isolated checks when useful.
