# Swagger UI, customization and publication

Read when a task changes UI consumption, document groups, authentication in the UI,
customization, exposure, proxy paths or CI publishing. UI behavior is tied to the bundled
Swagger UI version, not just springdoc's version.

## Choose the smallest maintained customization

Prefer supported springdoc properties for simple UI settings. Examples of useful decisions
are tag/operation sorting for findability, filtering, expansion depth, deep links, request
duration and snippets. Check each actual property against the chosen version. Schema/example
visibility should improve consumer understanding; hiding models to conceal missing detail
does not satisfy complete documentation.

Use annotations for operation-specific meaning and reusable OpenAPI components for shared
contracts. Programmatic customization is appropriate for a genuine cross-cutting convention
or a generator limitation. Make transformations idempotent, preserve operation overrides,
and test ordering when customizers interact. Avoid generating global 401/403/500 content
that conflicts with actual per-boundary errors.

An `OpenApiCustomizer` bean targets the default document; `GlobalOpenApiCustomizer` also
targets groups. A customizer attached to a GroupedOpenApi builder targets that group.
Verify the actual supported API and generated default/group output instead of assuming
that fixing one document fixed all of them. Model converters can affect every occurrence
of a type; verify request and response directions before applying a global override.

For layout, branding, plugins or interceptors beyond properties, inspect springdoc's static
resource integration and Swagger UI's configuration/plugin APIs. Function-valued JavaScript
options cannot be assumed to work by writing a string into YAML. Keep custom assets versioned,
minimize coupling to internal DOM/layout details and test after dependency updates. Preserve
accessibility and standard operation navigation when adding identity or styling.

## Publishing is a trust and routing decision

Use GroupedOpenApi paths/packages where audiences or contract versions differ. Compare each
group with its intended inventory and test exclusions. A filter hiding an endpoint from
the public document does not restrict the endpoint itself. Check JSON, YAML, swagger-config,
UI assets and management-port routing separately where used.

Resolve context path and reverse-proxy prefix/host/scheme deliberately. Test both document
fetch and the emitted Try it out URL; a UI that loads may still send requests to the wrong
server. Trust forwarded information only from a configured ingress that removes spoofed
client values. Use real known server URLs/variables; a staging UI must not mutate production
because a copied production server happens to be first in the list.

Choose security for the documentation audience and environment. Test anonymous and denied
access as applicable. OAuth2 UI integration should follow the actual flow with PKCE where
appropriate, exact scopes/redirect URLs and browser origin rules; never embed a confidential
client secret into browser assets. Keep synthetic credentials confined to isolated examples.

Decide token persistence explicitly: convenient authorization persistence can retain tokens
on shared workstations. Decide whether remote validation services may receive the contract;
disable external validator calls when document disclosure is not intended. Inspect the wrapped
springdoc runtime configuration: standalone UI defaults need not be springdoc defaults.
`tryItOutEnabled=false` controls initial activation, while `supportedSubmitMethods=[]` removes
Try it out for all methods. Neither hiding Authorize nor restricting this UI enforces server
authorization.
Check CORS/CSRF through the real credential flow, including docs served from another origin.

## Evidence from an actual consumer

Run the isolated fixture and, using an available browser runner or a manual check, verify:

1. Intended groups/tags/operations and server choices are discoverable; descriptions and
   optional/nested models appear; named examples select the expected bodies.
2. Required/optional fields, enum/null choices, multipart part types and polymorphic variants
   produce the promised request. Inspect the browser network request, not only the form.
3. Authenticated and public operations apply their different requirements correctly; no
   secrets persist or leave the expected origins contrary to the chosen policy.
4. Actual status, headers and response examples agree; test a positive call and a meaningful
   error, plus context/proxy URLs in the relevant deployment fixture.

HTTP tests of swagger-config/assets are useful but **do not execute the UI JavaScript**.
If a browser is unavailable, report UI interaction pending; do not replace this with a
claim that an HTML 200 proves UI correctness. Keep generated artifacts or screenshots only
when useful evidence; neither alone establishes the complete contract.

For CI, prefer existing generation tooling. Inspect Maven/Gradle plugin lifecycle and
server start/stop behavior before invoking it. Export from a disposable running fixture
when that is simpler. Use semantic diffs and example/client checks rather than a raw text
snapshot alone; harmless ordering changes and actual breaking contract changes differ.

Sources: [springdoc FAQ/customizers/groups](https://springdoc.org/),
[springdoc properties](https://springdoc.org/properties.html),
[Swagger UI configuration](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/),
[Swagger UI customization](https://swagger.io/docs/open-source-tools/swagger-ui/customization/overview/).
