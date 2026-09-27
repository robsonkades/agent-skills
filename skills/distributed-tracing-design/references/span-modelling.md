# Span Modelling

## Model card

For each span class:

```text
Name and instrumentation scope:
Logical operation and start/end:
Kind and semantic-convention version:
Parent selection:
Ingress trust boundary and context acceptance/restart policy (if applicable):
Links and link attributes:
Required/optional attributes:
Status/error/outcome rules:
Events and exception signal/migration:
Sampling/cost/privacy constraints:
Owner and incident query:
```

## Parent versus link

Parent:

- exactly zero or one;
- gives the child the same trace ID;
- identifies the primary causal context;
- does not require temporal containment.

Link:

- zero or many;
- may point within or across traces;
- suits batches, additional causes and following-trace relationships;
- can affect head sampling only when present at span creation.

The choice is semantic, not a workaround for duration. Trace UIs/backend retention may
handle long gaps differently; evaluate those operational constraints separately.

## Trust boundaries

Read the gateway/instrumentation policy and actual carrier path before choosing an external
parent. Trace context is correlation supplied by the caller; valid syntax does not
authenticate a caller, tenant or asserted relationship. A trusted hop may still forward
untrusted input, so establish which component created or accepted the context.

- Continue the accepted parent when the boundary policy permits it and the causal model
  requires it. Preserve adequate existing propagation; restarting every remote request
  needlessly fragments the operational view.
- When policy requires a fresh trace, model a new local root. A link to the originating
  context can retain correlation only if that retention is permitted. A link still stores
  supplied identifiers; it is not sanitization or proof that the remote span exists.
- If the policy or carrier provenance is unknown, report the alternative topologies and
  resolve that specific uncertainty before changing ingress behavior. Continue the local
  span-name, kind and completion review meanwhile.

Pass the accepted/restarted topology, carrier path and prohibited correlations to
`opentelemetry-performance` for propagator, baggage and remote-sampling enforcement; request
an integration fixture for that boundary. A new trace alone does not define baggage filtering
or telemetry resource limits. If that skill is unavailable, leave those mechanics conditional
and return the fixture requirements instead of treating a diagram as enforcement.

Sources checked 2026-09-25: [W3C Trace Context, allowed mutations and trust/abuse](https://www.w3.org/TR/2021/REC-trace-context-1-20211123/)
permits trace restarts at designated secure-network entry points and describes caller-controlled
context risks. [OpenTelemetry links](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)
explicitly supports a linked new trace when service policy does not trust incoming context.
Neither source requires every public endpoint to restart; the policy must be established.

## Retries

Distinguish logical call from attempts when both matter:

```text
logical client operation (optional encompassing span)
  attempt 0 -> timeout
  attempt 1 -> success
```

Follow the protocol semantic convention: some HTTP instrumentation emits each resend and
does not also emit an encompassing HTTP client span. Preserve resend count and final
logical outcome without double-counting service calls.

## Batch choices

| Model                             | Prefer when                                       | Cost/loss                 |
| --------------------------------- | ------------------------------------------------- | ------------------------- |
| one batch span, links per message | batch is unit of scheduling/commit                | per-record latency absent |
| one process span per record       | record outcomes/retries are operated individually | span volume               |
| receive batch plus process spans  | acquisition and record processing both actionable | more topology/volume      |

Cap link/event counts and inspect exported dropped-count fields; define a bounded custom
summary only when necessary. Giant batches can exceed SDK/backend limits. Sampling a batch
span does not retain the spans it links to: linked traces can have independent sampling and
retention decisions. Even same-trace spans can be missing through policy differences, export
loss or late arrival. Verify link-aware sampling behavior with `opentelemetry-performance`;
adding a link at creation only makes it available to the sampler, not an automatic keep rule.

## Long-running workflows

One trace can technically contain long-lived asynchronous spans, but retention, tail
sampling decision windows and UI usability may favor one trace per step linked through a
workflow. Keep workflow ID governed and avoid putting it in span names or metric labels.
Document replay/duplicate semantics.

## Test cases

Select cases relevant to the changed span classes and their failure contracts:

- stable names for unknown routes and arbitrary IDs;
- success, expected rejection, server failure, intentional caller cancel and timeout status;
- intentional CLIENT cancellation versus a SERVER span ending with HTTP 504: the client's
  cancellation exemption must not suppress the server's independently observed error;
- retry attempt versus logical outcome;
- batch with zero/one/many messages;
- redelivery;
- custom creation context preserved through send, with the corresponding kind and links;
- ambient context plus message creation context, including explicit parentage opt-in;
- library prefetch versus actual delivery to the caller;
- async completion after method return;
- link/attribute truncation;
- automatic plus manual instrumentation duplication;
- exception event/log migration with legacy queries and unsupported opt-ins.

### Trust-boundary decision pair

These are teaching cases and fixture requirements, not executed behavioral evaluations.

**A — hostile caller:** A public caller supplies a syntactically valid `traceparent` that
reuses a known unrelated trace ID and sets the sampled flag. The documented ingress policy
requires a fresh local trace and forbids retaining caller trace identifiers. The dashboard
shows a new root; a reviewer proposes restoring the incoming parent to connect the graph.

**Expected:** Preserve the deliberate root, reject the proposed parent and link retention,
and verify the actual ingress path follows policy. Do not use supplied IDs as authenticated
tenant/causal evidence or infer sampling enforcement from topology alone.

**B — decisive change:** The same operation receives a context newly generated by the
controlled gateway after ingress sanitization; callers cannot bypass that boundary, and the
documented internal policy permits continuation. Existing integration evidence confirms it.

**Expected:** Preserve the accepted parent and context continuity, without imposing an
unnecessary new trace. If gateway provenance cannot be established, keep that claim conditional.

**Failure:** Same unconditional restart/continuation rule for both cases; retaining a link
despite A's prohibition; calling the intentional root a propagation defect; or claiming
format validation authenticates context or proves a deployed enforcement test passed.
