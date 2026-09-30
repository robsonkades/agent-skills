# Contract ownership and documentation delivery

Read when creating an API, choosing documentation tooling, adding a consumer or changing
the contract's source of truth. For a narrow fix, reuse the established pipeline and update
its affected contract/tests. A complete consumer contract does not require installing every
documentation tool or publishing an interactive UI.

## Discover who depends on which artifact

Inspect checked-in specifications, generated sources, build plugins, test snippets, usage
guides, CI publication, access rules, ADRs and consumer/client repositories when available.
Identify the API's consumers, who approves incompatible changes, supported versions and the
artifact they actually use: machine-readable description, generated SDK, interactive console,
or a guide explaining a sequence of calls. Include operators who need failure/retry guidance.
Treat one handwritten YAML file as evidence to investigate, not automatic proof of policy.

If the decision is unresolved after inspection, ask about the dependency that changes it:
"Do partners generate clients or approve a specification before server changes? If so, keep
an approved OpenAPI contract as the authority; otherwise the current code/test-driven pipeline
may be sufficient." Do not ask users to choose a tool without explaining the consequence.
Continue DTO/behavior investigation while consumer approval or a publication audience is pending.

## Choose a source of truth and a drift check

| Existing evidence or need                                                                  | Proportionate choice                                                                                                          | Cost and evidence that could change it                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consumers review a specification before independently implementing clients/servers         | Contract-first: maintain the approved OpenAPI file; generate only useful interfaces/clients, or implement manually against it | Requires contract review/versioning and runtime conformance tests. Generated code is derived output, not a second editable authority.                       |
| The implementation is the accepted authority and clients need OpenAPI                      | Code-first: keep DTO/mapping semantics and targeted documentation metadata together; generate with compatible springdoc       | Inference misses some semantics. Validate emitted schemas/examples and consumer compatibility, rather than hand-editing generated JSON.                     |
| Consumers use a maintained scenario guide backed by Spring REST Docs                       | Reuse documenting tests and AsciiDoc assembly; add descriptors and scenarios for the changed behavior                         | Snippets prove observed exchanges, not every legal input or a machine-readable OpenAPI contract. A generated-client requirement changes the decision.       |
| A small internal operation has an adequate usage guide and no machine-contract requirement | Update that guide and its behavior tests; add no documentation dependency                                                     | Reconsider when independent consumers, governance or generation need a more structured contract. Internal access alone does not waive an existing standard. |

OpenAPI describes the contract; Swagger UI is a consumer of that description. Spring REST Docs
combines test-produced snippets with authored usage text. Its standard snippets are not an
OpenAPI document. Combining these approaches can serve distinct consumers, but inspect the
actual integration or extension, supported Boot/Framework/document dialect versions and
maintenance owner first. A REST Docs-to-OpenAPI extension or parallel springdoc generation
needs its own verification; do not assume every constraint, security requirement or polymorphic
schema transfers. Keep one authority for each fact and validate derived artifacts against it.

Preserve the target build/BOM and supported tooling. This skill's springdoc fixture establishes
only its stated pair; it does not validate REST Docs integration or an arbitrary converter.
Consult matching official references before recommending a dependency or version-sensitive API.

## Turn the choice into a reviewable delivery

1. Inventory the affected operations, public fields and consumers. Describe methods, paths,
   parameters/headers, request presence and serialization, success/errors and applicable access
   requirements. Include optional/nested fields and examples. For an API-wide documentation
   request, the inventory covers the whole agreed API; for one field fix, it covers that change.
2. Record the authoritative artifact, change owner and compatibility decision. New required
   input, tighter accepted values, changed null behavior, enum expansion in exhaustive clients,
   or removal of an error/header can break use even if a schema diff says additive. Test the
   actual consumer behavior where it matters; coordinate a migration/version only when needed.
3. Implement the contract at the existing DTO/controller/use-case boundary and update the
   selected source documentation in the same change. Explain workflows and failure recovery
   in prose where schemas cannot: pagination consistency, conditional updates, async completion,
   idempotency or quota behavior only when those contracts exist. Hypermedia requires real
   links/relations and client navigation needs; do not add Spring HATEOAS as a REST badge.
4. Run the documenting/contract tests and generation using the project's build lifecycle.
   Assert status, relevant headers and body, plus rejected input/no side effects. In REST Docs,
   strict field descriptors detect undocumented fields and missing non-optional fields in the
   exercised payload. Relaxed descriptors, ignored fields or whole-subsection descriptors can
   serve a focused scenario but cannot prove all nested properties are documented. Exercise
   optional values and variants separately; describing a field as optional does not test it.
5. Assemble and inspect the delivered artifact: included snippets must be current, links and
   examples usable, and published OpenAPI must match the validated revision. Prevent stale
   snippets or a skipped test task from producing a seemingly current guide. A test returning
   200 without descriptor/contract assertions does not establish documentation fidelity.
6. Use the existing publication channel and audience policy. A versioned static contract or
   restricted guide can satisfy delivery without runtime `/v3/api-docs` or Swagger UI. Verify
   generation, validation, publication commands and required credentials are documented without
   secrets; changes to real publication/access follow the task's authorization. If a UI is
   supplied, follow [UI and publication](swagger-ui.md) and test its actual requests.

Use [springdoc/OpenAPI](springdoc-openapi.md) for generation and feature fidelity, and
[schemas and examples](schemas-and-examples.md) for wire/schema agreement. For REST Docs,
adapt the resolved release's official setup to the existing test framework; do not copy
Boot 3 test auto-configuration imports into Boot 4. If build/plugin support is unavailable,
complete static contract work and report the exact generation/rendering/consumer checks pending.

## Two choices that should differ

An established internal guide with tested examples can remain the right deliverable for a
renamed validation field: update the public path, documenting assertion and rendered guide.
Adding an independent partner that requires OpenAPI for SDK generation changes the artifact
need. Choose an explicit source/generation path and check the SDK; keeping the guide alone
would leave that consumer unable to integrate. Preserve the guide if it still serves people.

Similarly, a machine-consumed static OpenAPI contract does not require an interactive console.
Defer a UI unless consumer usage justifies it; reconsider when onboarding or exploration needs
one. This avoids a new public route, browser authentication flow and maintenance cost while
retaining a complete agreed contract.

Primary sources: [Spring REST Docs 4.0.0 scope and extension distinction](https://github.com/spring-projects/spring-restdocs/blob/v4.0.0/README.md),
[REST Docs 4.0.0 field descriptors and relaxed coverage](https://github.com/spring-projects/spring-restdocs/blob/v4.0.0/spring-restdocs-docs/src/docs/antora/modules/reference/pages/documenting-your-api/request-response-payloads.adoc),
[OpenAPI 3.1.1 specification](https://spec.openapis.org/oas/v3.1.1.html),
[springdoc integration and compatibility](https://springdoc.org/).
