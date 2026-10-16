# Reports endpoint extraction
Java 21, no preview features or extra libraries. The endpoint returns 404 for an absent report, 403 for a restricted report the viewer cannot read, and 200 with its title otherwise. The accepted endpoint is ExistingEndpoint; ProposedEndpoint is the review candidate. Upstream request binding constructs a non-null Viewer snapshot (anonymous where appropriate). Directory lookup remains available for projects selecting that provider.

Check the configuration and actual call paths before merging. The in-memory repository returns immutable records. These fixtures model endpoint decisions, not HTTP binding or serialization.

Compile: javac --release 21 -d classes Reports.java Smoke.java
Run: java -cp classes Smoke
