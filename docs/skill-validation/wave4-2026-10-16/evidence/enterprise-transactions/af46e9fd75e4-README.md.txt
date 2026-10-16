# Retained review evidence

Owned skill: enterprise-transactions. All repository writes are limited to its three changed files. Version 1.3.4 -> 1.3.5.

Actor inputs: inputs/case-a and inputs/case-b. They differ only in application.properties. Do not give evaluator/ or evidence/ to an actor. Hidden criteria: evaluator/criteria.json.

Reproduce technical checks with Node 25.6.1:

    node "C:/Users/robso/AppData/Local/Temp/enterprise-transactions-quality14-79a320631fa34154b7f92509cd617fcd/evaluator/run-local.mjs"

The runner uses only existing Spring 6.2.12 jars at the recorded Maven-cache paths and Temurin 25.0.3. It compiles source with --release 17, runs the real Spring manager/template/helper against recording JDBC doubles, and performs the official package-local validation and formatting checks. It creates or overwrites only this temporary evidence directory and its classes directories, while reading the assigned package. It does not install tools or touch a database. The four technical scenarios are not agent evaluation, ORM integration, database cancellation, lock-release, or hard wall-clock evidence.

14 subprocess commands passed. Case A executes 24 assertions; case B executes 23. The negative/basic path remains in the transaction yet omits the statement timeout. The adequate/remaining path applies timeout, detects the deterministically expired holder before execution, requests rollback and closes resources. Actual database outcomes require a separate integration test.
