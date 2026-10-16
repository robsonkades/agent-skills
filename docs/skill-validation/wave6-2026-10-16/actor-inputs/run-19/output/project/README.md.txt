# Best-effort memo review

Target: Java SE25, no preview or external dependencies. Compile src/memo/*.java and test/memo/Smoke.java with javac --release 25 into a temporary output directory; run memo.Smoke.

The memo is initialized before worker threads start. A producer installs one entry after constructing it; independent consumers call find(). The project intentionally allows lookup misses and has no eventual-hit requirement. Review the source and docs/contract.md rather than inferring a stronger cache contract.
