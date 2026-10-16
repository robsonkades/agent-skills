# Storage service wiring review

Target Java 17, Spring Framework 6.2.7. No preview features. This fixture uses an open local
file channel in place of an external archive connection, so no network or credentials are needed.

Review the singleton scope and resource lifetime of this wiring before release. Inspect the
source, startup and existing checks. Preserve an adequate design; report any necessary change
with evidence and a focused verification. Do not add a global accessor or new service interface
merely because the review concerns Singleton. Source edits are optional for this review.

Copy the selected StorageConfiguration.java into src and run ./run-smoke.ps1 in PowerShell.
The script uses the existing JDK and cache paths listed in fixture-dependencies.json; it does not
download dependencies or modify Maven caches. Adjust existing toolchain paths if needed.
