# Java Logging Mechanics

## Typed event example

Partial Java 17 examples: supply the application variables, logger and exception types.
The fluent calls require SLF4J 2.x plus a compatible provider; they are unavailable in 1.7.
Check the resolved dependencies before adapting these snippets. MDC additionally needs the
`org.slf4j.MDC` and `java.util.Map` imports and the existing executor/task.

```java
logger.atInfo()
    .setMessage("order transitioned")
    .addKeyValue("event.name", "order.transitioned")
    .addKeyValue("event.version", 2)
    .addKeyValue("order.reference", safeReference)
    .addKeyValue("outcome", outcome.name())
    .log();
```

Fixture-test the configured provider/encoder; the SLF4J API does not dictate backend JSON
shape.
For example, the historical local fixture with SLF4J 2.0.9 and Logback JsonEncoder 1.4.11 emitted
`event.version` as the string `"2"` inside `kvpList`, despite the integer argument above.
That output does not satisfy a schema requiring a numeric top-level field; configure/map
and validate the actual representation rather than assuming `addKeyValue` guarantees it.

## Throwable example

Use this variant only when the stack/cause is needed and this stream's policy permits the
actual exception content, including nested causes and suppressed exceptions. Otherwise emit
the approved bounded classification, incident reference or summary that meets the consumer
contract; omit `setCause(ex)` and do not copy its prohibited message into another field.

```java
try {
    charge();
} catch (PaymentGatewayException ex) {
    logger.atError()
        .setMessage("payment gateway call failed")
        .addKeyValue("event.name", "payment.gateway_failed")
        .addKeyValue("gateway", boundedGateway)
        .setCause(ex)
        .log();
    throw ex;
}
```

Choose this boundary as log owner only if the event is not recorded again without a
distinct purpose. Exception messages and stack values may contain secrets or user data;
redaction/length policy still applies.

## MDC lexical restore

Conceptual wrapper:

```java
Map<String, String> submitted = MDC.getCopyOfContextMap();
executor.execute(() -> {
    Map<String, String> prior = MDC.getCopyOfContextMap();
    try {
        if (submitted == null) MDC.clear();
        else MDC.setContextMap(submitted);
        task.run();
    } finally {
        if (prior == null) MDC.clear();
        else MDC.setContextMap(prior);
    }
});
```

Prefer adequate framework/instrumentation wrappers already in use. SLF4J 2.0.9 specifies a
copied String-to-String map, and Logback 1.4.11 copies when getting or setting that map. The
returned copy is still mutable: keep the captured map private and unchanged after submission
(or freeze an approved subset). Restore previous context and select relevant
rejection/cancellation/nested-submission controls for a changed bridge.
MDC is not a security boundary; validate values before logging.
The full-map wrapper is appropriate only for already-approved context. Across a trust or
tenant boundary, propagate an allowlisted subset and keep trusted envelope fields protected.

## Virtual threads and ScopedValue

Do not infer MDC behavior from virtual-thread count. Providers may use ThreadLocal and
instrumentation may bridge trace context separately. ScopedValue is not automatically
recognized by logging frameworks. If adapting it, keep lexical scope and avoid copying
mutable maps. Test on the exact JDK/provider.

## Injection and bounds

JSON encoders normally escape control characters syntactically, but downstream renderers,
templates and nested messages can still be unsafe. Validate type/length, encode for the
actual sink/viewer and prevent CR/LF/delimiter forging in text formats. Avoid calling
toString on large/untrusted graphs.
Bound values before serialization, with explicit truncation metadata where useful. Cutting
encoded bytes can split UTF-8 or JSON tokens; enforce the final byte budget with a valid
smaller record or an observable rejection, not arbitrary byte truncation.

## Contract test

For a new or changed API, encoder, context bridge or data policy, use actual encoded fixtures
for the affected contract, reusing adequate existing controls. Select the relevant assertions:

- parseable one-event framing;
- name/version/service/timestamp where required by the event's schema;
- correct types/units;
- reserved-key collisions rejected or handled by the documented trusted-field policy;
- occurrence-time values survive delayed encoding without caller mutation;
- valid context included and absent context not stale;
- Throwable structure under policy;
- CR/LF and large input safely encoded/truncated;
- secret fixtures absent from every field/message/stack;
- overflow/drop behavior observable when delivery is being changed or claimed.

The [SLF4J manual](https://www.slf4j.org/manual.html#fluent) defines the fluent API; the
[Logback encoder documentation](https://logback.qos.ch/manual/encoders.html) describes one
backend's output. Neither replaces a fixture against the deployed encoder configuration.
For the map-copy statements, see [SLF4J 2.0.9 MDC](https://github.com/qos-ch/slf4j/blob/v_2.0.9/slf4j-api/src/main/java/org/slf4j/MDC.java)
and [Logback 1.4.11 MDC adapter](https://github.com/qos-ch/logback/blob/v_1.4.11/logback-classic/src/main/java/ch/qos/logback/classic/util/LogbackMDCAdapter.java).
