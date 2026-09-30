# Failure, time and response bounds

Read when calls stall, payloads grow, errors lose useful semantics or resilience is
being added. This reference owns Spring integration points; deadline arithmetic,
backoff design and durable idempotency remain the neighboring skills' responsibility.

## A timeout needs a phase and an owner

Map each configured limit to the selected transport implementation. Include pending
pool acquisition, connect/proxy/TLS, response headers, body reads and decoding. Some
read settings are inactivity limits and can be kept alive by a slow trickle. Other
implementations bound a wider response interval. Do not transfer a setting's meaning
between clients because both call it `readTimeout`.

Test delayed headers and a body stalled after headers separately. Framework 7.0.9's
[`JdkClientHttpRequest`](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-web/src/main/java/org/springframework/http/client/JdkClientHttpRequest.java)
implements an additional timer and closes the response stream on expiry. Therefore
raw JDK 25 `HttpRequest.timeout` behavior is not sufficient evidence for the Spring
factory's behavior. Verify the configured Spring factory rather than extrapolating
from a raw JDK client or a different transport.

An operation budget must include local admission, all attempts, backoff and response
handling. Reuse the project's shrinking deadline and refuse dispatch after expiry.
Do not reset it inside a proxy/filter or turn a positive sub-millisecond remainder into
an unlimited zero timeout. If the transport has no supported per-request limit, choose
an owned cancellation mechanism or a client configuration that meets the contract;
changing a shared factory during a request introduces races.

For WebClient, an outer `Mono.timeout` can bound subscription through a terminal result
and cancel upstream; calculate remaining budget at subscription/attempt time. A
`Flux.timeout(Duration)` is generally a gap-between-signals policy, not a total stream
lifetime. Configure the stream's overall lifetime and byte/item budget separately.
An adapter's blocking wait timeout or `Future.get(timeout)` does not establish prompt
transport cleanup. Observe cancellation and resource release; peer work may continue.
See [Reactor timeout contracts](https://projectreactor.io/docs/core/release/api/reactor/core/publisher/Flux.html#timeout-java.time.Duration-)
and [Mono timeout](https://projectreactor.io/docs/core/release/api/reactor/core/publisher/Mono.html#timeout-java.time.Duration-).

## Bound successful and unsuccessful responses

For an ordinary trusted finite API, use the framework's DTO/body extraction and the
project's established limits. A handwritten decoder and exception hierarchy add no
value just because the call crosses HTTP. Establish what bounds actually hold; a
provider's size promise is an assumption, not a locally enforced cap.

An untrusted peer, large export or explicit memory limit changes that choice. Prefer
an existing enforced codec/transport limit. When the selected imperative path lacks the
required cap, finite bounded extraction inside `exchange` is one conditional option:
check status before copying diagnostic bodies; reject a declared excessive length;
read at most `limit + 1` bytes and reject excess before decoding. Use an appropriate
representation/decoder rather than turning this into a generic text/JSON client.
The response stays owned by the exchange scope. Apply the cap to the representation
whose memory use matters, including decompressed data if compression is supported.

Length may be absent or false, and compressed data can expand. Keep a time bound too.
Truncating after `body(String.class)` or constructing a shorter error message is too
late to prevent the original buffering. Do not introduce WebFlux solely to avoid
understanding an existing imperative client's response contract.

`RestClient.retrieve()` applies status handlers. `exchange()` gives the callback full
response control and does **not** invoke those handlers. For finite value extraction,
the default exchange form closes the response when the callback returns, including
failure; consume or decode inside that scope. Streaming needs an explicit owner.
Framework 7.0.9's implementation recognizes returned `InputStream`/`InputStreamResource`
values (also inside `ResponseEntity`) and transfers close responsibility; a custom
holder around a stream does not receive that special treatment. Check the deployed
version and result type instead of assuming every returned stream stays open or closes.
For an explicit non-closing exchange, the caller owns response closure. Test success,
error and cancellation for the chosen path. See the
[`exchange` API](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/web/client/RestClient.RequestHeadersSpec.html)
and the pinned
[streaming-result implementation](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-web/src/main/java/org/springframework/web/client/DefaultRestClient.java).

For WebClient, configure `codecs(...defaultCodecs().maxInMemorySize(...))` for aggregated
decoding instead of disabling the cap after a `DataBufferLimitException`. Streaming
requires bounds on total work as well as decoder buffering. Preserve the configured
builder and transport when changing codecs. See
[WebClient codec/resource configuration](https://docs.spring.io/spring-framework/reference/web/webflux-webclient/client-builder.html).

Use `exchangeToMono`/`exchangeToFlux` when different statuses require different decoding.
Decode within their callback; after the returned publisher completes, an unconsumed
body is released and cannot be decoded later. A custom filter that swallows or retries
a response must consume/release it before the next exchange. Raw pooled `DataBuffer`
handling requires ownership on success, error, cancellation and discard; prefer the
framework's body extraction APIs when they satisfy the contract. Do not drain an
unbounded slow error body just to preserve reuse. See
[exchange lifecycle](https://docs.spring.io/spring-framework/reference/web/webflux-webclient/client-exchange.html)
and [filter responsibilities](https://docs.spring.io/spring-framework/reference/web/webflux-webclient/client-filter.html).

## Translate evidence before applying resilience

Start with the framework's status/transport exceptions when callers need no different
contract. Add domain-specific translation only where callers must distinguish absence,
rejection, retry advice or an unknown effect. Preserve bounded status/category metadata
and validated delay advice; a generic exception family for every remote client is not
required. Preserve useful causes for restricted diagnostics but do not blindly log
exception messages, which can
contain sensitive URLs or bodies. A `404` may mean absence or a broken route; map it
to an empty domain result only when that endpoint contract says so. An empty body is
not automatically a successful lookup.

Translate at the boundary that owns the consumed contract. A provider's `401` can
mean this service's credentials are invalid; in that case, passing it unchanged to an
inbound caller would incorrectly ask that caller to authenticate again. Retain the peer, operation,
safe identifier and original cause for diagnosis, while mapping to the application's
established failure contract. Reuse a meaningful existing business exception base when
the failure is a business outcome; do not convert outages or malformed provider data
into `NotFound` or create a competing hierarchy for every client. Never relay raw provider
problem details, stack traces or credentials as the service's public error response.

`429`/`503` may be candidates for another attempt, subject to the operation and budget.
Validate `Retry-After` as delta-seconds or HTTP-date, cap parsing/input size and refuse
an attempt if the valid delay cannot fit; do not shorten it and retry early. Same-input
validation and authorization failures normally require correction. A network exception
does not prove whether a mutation was transmitted or committed. Keep the operation
identity and reconcile an unknown outcome; sending a new key would create a new intent.
For example, a provider can record a shipment and then lose its response. Retain that
shipment intent and use the provider's lookup/replay contract; neither an HTTP interface
nor an `UnknownOutcome` exception implements durable recovery. If that contract is
unknown, do not redispatch merely because the client timed out. A documented definitive
rejection may instead permit the caller to record a known failure.

Integrate the resilience mechanism already present. Framework 7 resilience annotations,
Spring Retry and Resilience4j are distinct APIs with different packages and activation.
Check resolved versions, imports, proxy invocation, reactive support and attempt-count
meaning before copying an annotation. The
[Framework resilience reference](https://docs.spring.io/spring-framework/reference/core/resilience.html)
documents its own facilities; this skill does not authorize adding or replacing a
resilience library.

Place retry at the boundary that knows operation semantics and owns the logical budget.
For reactive clients a retry resubscribes: defer per-attempt creation as needed, retain
one intent, reproduce the same semantic payload and count outgoing attempts. A one-shot
request stream is not repeatable. For imperative proxy advice, test invocation through
the actual proxy; self-invocation can bypass it. Release responses and transaction/
connection scopes before waiting. Inspect built-in transport retries and proxies too.

Decorator order changes behavior: a breaker outside retry may observe one logical
result, while one inside may observe each attempt; a bulkhead held across backoff
occupies capacity while doing no useful work. Choose those scopes from the desired
admission/measurement contract and test them. A circuit-open result, local acquisition
timeout and remote rejection should remain distinguishable. Do not add a retry layer
until its owner, repeated effects and response release are established.
