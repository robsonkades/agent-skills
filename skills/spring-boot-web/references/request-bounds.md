# Bound JSON before binding

Read when implementing JSON request limits, investigating memory pressure during input
conversion, or testing hostile bodies. Inspect the ingress, connector, filters, actual
message converter/mapper and endpoint workload first. Keep adequate existing controls;
there is no universal request-size budget.

## Three layers, three different contracts

| Layer               | Decision                                                                                                                                                                  | Verification                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Received body bytes | Enforce the application's body budget at the trusted ingress and/or bounded application reader. A Content-Length check is an early rejection, not the complete mechanism. | Known length and HTTP/1.1 chunked/no Content-Length; exact boundary and over it; multibyte characters; no handler/service effect on rejection. |
| JSON parser         | Bound nesting, strings, names, numbers and, when supported, document/token counts before constructing the complete object graph.                                          | Deep objects/arrays, a large single token and many small tokens; confirm the configured mapper is the converter's mapper.                      |
| DTO/business input  | Validate allowed values, lengths, collection counts and nested invariants after conversion.                                                                               | A small, well-formed body can still violate the transport/domain contract. Do not present Bean Validation as a parser memory bound.            |

`server.tomcat.max-http-form-post-size` bounds form content, not arbitrary JSON bodies.
Multipart limits and `max-swallow-size` have other purposes too. For Boot **4.1.1** with
Jackson 3, inspect `spring.jackson.factory.constraints.read.*` properties, including
`max-nesting-depth`, `max-string-length`, `max-number-length` and `max-document-length`.
Verify availability on the target 4.x release and any custom mapper factory before copying
configuration. Do not overwrite existing modules or build an unrelated mapper just for limits.

Jackson's document/string limits are checked during buffer processing and are not exact
HTTP byte counters. Units can be bytes or characters according to the parser input. A
document limit also serves a different purpose from a nesting or individual-token limit.
If the HTTP contract promises an exact byte limit, enforce and test that boundary separately.
For compressed input, identify which layer decompresses and bound the relevant compressed
and expanded representations; do not claim a wire-byte cap bounds expansion memory.

## Choose a mechanism that fits the endpoint

First inspect existing ingress controls and whether every caller must pass through them.
When those controls meet the body budget, preserve them and use Boot's Jackson constraint
properties for parser limits. Do not add a second buffering layer just because a sample
had one. There is no general Boot MVC property that makes a form-post limit an exact JSON
body-byte contract.

The decision changes when the contract promises an application-local exact byte ceiling,
or callers can bypass the enforcing ingress. For small synchronous JSON commands, a narrowly
scoped `RequestBodyAdvice` before conversion can reject an oversized declared length and
read at most the accepted limit plus one byte, rejecting overflow before replaying the bounded
buffer. Count actual bytes even without Content-Length. Scope it to the intended endpoints
and converter, preserve headers and test the integration; this is conditional custom code,
not part of the sample's ordinary controller setup. A header-only check is insufficient.

Large accepted streams need incremental processing and resource ownership appropriate to
the endpoint. Reuse a proven bounded reader/ingress control rather than buffering the full
stream to calculate its size. Counting bytes does not bound how long a slow client may
hold the request: retain transport read timeouts, admission and disconnect handling from
[capacity and lifecycle](capacity-and-lifecycle.md).

An application byte-limit rejection can use **413**; parser and DTO failures are normally
**400**, at different stages. Preserve the target API's documented policy and identify
which layer produces the response. An ingress/container rejection need not share MVC's
ProblemDetail body. Publish 413 only for operations with that reachable limit; do not add
it mechanically to every GET or protected bodyless endpoint.

## Reproducible evidence

The [fixture](../assets/contract-fixture/) sets Boot Jackson depth/string/number properties
and sends hostile PATCH bodies to the actual product controller. Tests distinguish parser
rejection from DTO validation and verify the stored description remains unchanged. It does
not advertise an exact received-byte ceiling or a corresponding 413 response.

If the target API requires that ceiling, verify known-length and chunked bodies at the exact
limit and one byte over, multibyte input and no handler/service effect on rejection. Test the
actual enforcing ingress or local reader and compare its response with the published contract.
These checks cannot be replaced by parser-property assertions; neither establishes slow-client,
decompression, streaming or deployed ingress behavior unless explicitly exercised.

Sources: [Boot 4.1.1 property contracts](https://docs.spring.io/spring-boot/appendix/application-properties/index.html),
[Tomcat 11 HTTP connector](https://tomcat.apache.org/tomcat-11.0-doc/config/http.html),
[Jackson 3.1 stream constraints](https://github.com/FasterXML/jackson-core/blob/3.1/src/main/java/tools/jackson/core/StreamReadConstraints.java),
[MVC RequestBodyAdvice](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/web/servlet/mvc/method/annotation/RequestBodyAdvice.html).
