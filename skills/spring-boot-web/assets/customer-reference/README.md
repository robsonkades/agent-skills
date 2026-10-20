# Executable Customer reference

This is the current-file reference from `C:\git\customer`, packaged so the skill can
show complete classes and run independently of that checkout. Read the
[implementation guide](../../references/customer-pattern.md),
[source index](../../references/customer-source-index.md) and
[coverage matrix](../../references/customer-coverage.md) before adapting it.

## Source fidelity

The bundle contains all 41 production Java files, all seven test classes, `pom.xml`
and `application.yaml`. Production code and build/runtime configuration are copied
without behavioral changes. The only test adaptation adds `@DisplayName` to the 56
test methods, as requested; assertions, parameter sources and setup remain intact.
Parameterized tests expand to 126 executions. No deleted module was recovered from Git.

[source-provenance.json](source-provenance.json) records the original file hashes,
checkout path, capture time and HEAD. The working tree was modified: HEAD alone does
not identify these sources. Hashes refer to the original files, before the test
annotation adaptation. Recheck the current authoritative checkout before refreshing
the snapshot; do not silently substitute a newer library or an older committed file.

## Run in isolation

Use Java 25 and Maven 3.9+ with the dependencies in [pom.xml](pom.xml). The reference
uses Boot 4.1.1 and springdoc 3.1.1. Preserve this pair when validating the copy.
Copy this whole directory to a temporary workspace and run there:

```powershell
mvn -B -ntp test
```

Use `-o` only when the exact dependencies are already available locally. Build output
belongs in the temporary workspace, never in the skill package. The original Maven
wrapper is not included; these commands use an installed Maven. Inspect test reports
and counts as well as the process exit code. Expected ERROR logs from deliberately
injected failures are not failed tests.

The contract tests write:

- `target/openapi/openapi.json`, generated from `/v3/api-docs`;
- `target/openapi/contract-test.json`, generated from `/v3/api-docs/contract-test`.

`contract-test` is a test-only group. Production configuration declares no groups.
Do not ship the test configuration as a production grouping requirement. Read each
test's imports to distinguish full-context tests, MVC slices and direct handler tests.
The HTTP tests use MockMvc and dispatch asynchronous responses; they do not establish
real-network or browser behavior.

## Inspect Swagger UI

After the tests pass, package the same temporary copy:

```powershell
mvn -B -ntp -DskipTests package
java -jar target/customer-0.0.1-SNAPSHOT.jar --server.address=127.0.0.1 --server.port=0
```

Read the allocated port from the startup log, then open
`http://127.0.0.1:<port>/swagger-ui/index.html`. Loopback and random port are command-line
overrides for this review, not settings added to the copied `application.yaml`.
Stop the server when finished. Use disposable data in this isolated process.

Check the rendered contract and execute a representative consumer flow:

1. Inspect the six operations, request/response schemas and named examples, including
   the eight tagged search filters and separate create, PATCH and response models.
2. POST a documented create example. Inspect the 201 response, normalized fields and
   absolute `Location`, then GET the returned resource.
3. List/search that customer using documented filters, page bounds and sort options.
   Inspect the populated and empty-page examples and discriminator choices.
4. PUT a complete replacement, then PATCH a documented partial root update. Confirm
   the unchanged ID and omission/null rules. A supplied address requires its complete
   required fields; the media type alone does not prove unrestricted recursive merge.
5. Submit an empty PATCH and inspect the documented business 400. Read the distinction
   between business-specific examples and the conditional common error catalog.

Record UI rendering and Try it out separately from document parsing, schema validation
and MockMvc results. An HTML 200 or a test-count summary is not browser evidence.

## Boundaries of this reference

The in-memory repository and supporting application/domain classes make the documentation
example executable. This bundle does not establish durable storage, authentication,
authorization, production servers, uploads, streaming or webhooks. The common error catalog
includes conditional infrastructure statuses; it does not enable those features.

The supporting business code belongs to this Customer example. It does not replace the
separately approved DDD reference. For another API, preserve its actual business rules
while following the verified documentation organization and mechanisms shown here.
