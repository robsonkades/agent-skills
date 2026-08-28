# Coupling, cardinality and the failure surface of an adapter

## The unversioned contract

An adapter that parses application output depends on an interface with no schema, no version
and no deprecation policy. The application team does not know the dependency exists, so the
change that breaks it will not be announced.

What makes it survivable:

- **A fixture captured from the real image**, not written by hand. Run the application, take a
  hundred lines or one exposition dump, commit it, and run the adapter against it in CI.
- **Assert on meaning, not on parseability.** A renamed field usually still parses — into
  `null`, or into the wrong column. Assert specific values from the fixture reach specific
  output fields.
- **Re-capture the fixture on every application upgrade**, mechanically. A pipeline step that
  diffs the newly captured sample against the committed one turns a silent break into a failed
  build. This is the single highest-value control in the whole pattern.
- **Fail loudly on unparsed input.** An adapter that drops lines it cannot parse hides exactly
  the event you needed. Emit a counter of unparsed records and alert on it being non-zero;
  a rate above zero after a deploy is the format change, found in minutes instead of a
  quarter.

## What an adapter cannot synthesise

| Wanted                      | Can the adapter produce it?                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Trace / span ID             | **No.** It is created inside the request path. A proxy or sidecar can propagate one but not attach it to a log line the app wrote without it |
| Correlation / request ID    | **No**, unless the app already prints it. Generating one per log line correlates nothing                                                     |
| User or tenant identity     | **No**, unless emitted. Inferring it from an IP or a path is a guess presented as a fact                                                     |
| Event timestamp             | Only if emitted; otherwise it stamps arrival, which is wrong by the buffering delay                                                          |
| Severity                    | Sometimes — derivable from a text prefix, and wrong whenever the app's own convention changes                                                |
| Pod, node, container, image | **Yes.** These are environment facts available to the sidecar, and they are its legitimate value-add                                         |
| Exception class and stack   | Only as text. Multi-line stacks must be re-assembled by the adapter, and the join rule is a guess                                            |

The bottom row of the "yes" section is the pattern's real contribution: pod-local identity
attached to output that had none. The rows above it are the requests that should be refused
and pushed back into the application, where `structured-logging` and
`distributed-tracing-design` decide the design.

## Cardinality, as arithmetic

Series count is the **product** of the label value sets, not the sum. An adapter that derives
labels from application output is a cardinality risk precisely because the output's value
space is unbounded and the adapter cannot see that it is.

```
method (7) × status (12) × route_template (60)             =  5,040 series   fine
method (7) × status (12) × raw_path (unbounded, IDs in it) =  unbounded      an incident
```

Rules that hold regardless of backend: never label with anything that identifies a user, an
order, a session, a full URL path, a full exception message, or a timestamp. Where a route
must be labelled, the adapter must map it to a **template** from a fixed list, and count
anything unmatched into a single `other` bucket — with a counter on how often that bucket is
hit, because a growing `other` means the route list is stale. Sizing the resulting series
budget is `metrics-and-cardinality`.

## When the adapter falls behind or dies

| Handover                                       | Adapter slow                                                                  | Adapter dead                                                        | Make it survivable by                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| App writes to stdout, runtime collects         | Nothing — the runtime, not the adapter, drains the pipe                       | Nothing for the app; telemetry gaps only                            | Keeping the adapter off the app's write path in the first place                                    |
| App writes to a pipe the adapter drains        | The 64 KiB kernel pipe buffer fills and `write` **blocks the logging thread** | Same, permanently: the app stalls on its first full buffer          | Never put the adapter on the app's write path; if unavoidable, a bounded async appender that drops |
| App writes a file to `emptyDir`, adapter tails | The file grows                                                                | The volume fills and the pod is evicted for ephemeral-storage usage | `sizeLimit` on the volume, rotation with a retained-file cap, and an alert on volume usage         |
| Adapter scrapes the app and re-exposes         | Stale values served as if current                                             | Scrape failures — which look like the application being down        | Exporting sample age and the adapter's own scrape success                                          |

The second row is the one that turns an observability component into an availability
component: a logging sidecar can stop a payment. If the application must log through the
adapter, the appender must be asynchronous **and bounded**, and must drop rather than block —
and the number of dropped records must itself be a metric.

## Testing the output contract

```java
// Conceptual: a contract test over the adapter, run in CI.
// Input is a fixture captured from the real application image.
String raw = Files.readString(Path.of("src/test/fixtures/app-2026.8.1.log"));

List<LogRecord> out = adapter.translate(raw);

assertThat(out).hasSize(100);                                  // nothing silently dropped
assertThat(out.getFirst().timestamp())
        .isEqualTo(Instant.parse("2026-08-27T10:15:03.412Z")); // event time, not arrival
assertThat(out.getFirst().fields())
        .containsEntry("level", "ERROR")
        .containsEntry("order_id", "ORD-4471")                 // a field, never a label
        .doesNotContainKey("trace_id");                        // the app emitted none: assert it
assertThat(adapter.unparsedCount()).isZero();
```

Three properties this asserts that a manual check does not: nothing was dropped, event time
survived the translation, and the adapter did **not** invent an identifier. Add the negative
case explicitly — feed it the next release's fixture and require the build to fail until
someone looks.

For the exposition side, validate the adapter's output with the platform's own tooling rather
than a regex of your own (`promtool check metrics` reads an exposition stream and reports
naming and format violations). A contract test against the consumer's parser is worth more
than any number of tests against your idea of the format.
