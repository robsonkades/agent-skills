---
name: structured-logging
description: >
  Designing application logs as governed event schemas: choosing events and fields,
  correlation and context lifecycle, exception and severity semantics, synchronous versus
  buffered delivery, overload/drop behavior, injection prevention, data minimization,
  integrity/retention and measurable cost. Use when logs require regex parsing, correlation
  is missing or stale across async work, events disappear under load, fields drift between
  services, failures are duplicated, secrets or untrusted text reach logs, or logging
  appears in latency profiles. Metric labels belong to metrics-and-cardinality; span
  topology to distributed-tracing-design; JVM -Xlog to unified-logging.
---

# Structured Logging

## Purpose

Emit events that answer operational, security, audit and business questions without making
logging a latency, availability, confidentiality or integrity hazard.

Structured fields improve stable querying, but structure does not create facts that were
never recorded. Logs are neither the only source of rare/unanticipated evidence nor a
license for arbitrary payload retention. Design from explicit uses, threat model and
retention policy.

## Workflow

Start with the requested event, defect or decision; reuse adequate schema, configuration and
fixture evidence. A narrow explanation or a sound existing design can close without a new
schema, transport, benchmark or failure campaign. Apply the steps below to affected contracts.

For version-sensitive API/output/delivery claims, inspect the project's Java release, resolved
SLF4J API/provider/encoder versions and effective configuration. Examples are partial Java 17
snippets using SLF4J 2.x fluent APIs; retain an adequate existing API and encoder, including
parameterized calls, without assuming an upgrade is authorized. Missing configuration limits
delivery and JSON-shape conclusions; it need not block an independent policy or source answer.

### 1. Define event classes and consumers

For each new or changed event establish the relevant contract, using maintained definitions:

- stable event name/version and producer;
- operational, security, audit or business purpose;
- occurrence boundary and deduplication semantics;
- required/optional fields with type/unit;
- severity and expected consumer/action;
- sensitive/untrusted fields and transformations;
- delivery, ordering, retention and integrity requirements.

Security/audit records often need a separate durable, access-controlled path. Application
debug logs must not be treated as an authoritative audit ledger.
Durable delivery alone does not make an audit event atomic with a business commit. If that
invariant is required, define the transaction boundary (for example, a transactional outbox),
event identity and replay/deduplication behavior; distinguish an attempted action from a
committed result.

### 2. Define a common envelope

Typical fields include timestamp with timezone, event name/schema version, severity,
service/deployment/instance identity, logger, message, trace/span/request/business
correlation when valid, outcome/error type and source clock.

Not every event has a request or active trace: startup, scheduler, health and background
events legitimately omit them. Encode absence explicitly where consumers require it; never
copy stale context to satisfy a mandatory-field rule.

### 3. Choose API, encoder and transport together

SLF4J fluent key-value APIs preserve field intent, but the selected provider/layout determines
the emitted representation. Verify the required structure and types against actual output.
Parameterized messages avoid unnecessary formatting when disabled; adequate existing APIs and
encoder mappings may stay when they already produce the required event contract. Plain
formatted prose alone does not establish typed fields.

Choose synchronous, buffered/asynchronous or durable delivery from the loss/blocking
contract. Queue capacity, discard/block policy, shutdown flush, sink failure, rotation and
container stdout behavior are part of production semantics—not implementation details.
A normal return from the logging API is not a delivery acknowledgement, even on a synchronous
path. Verify how the provider exposes runtime failures independently of the affected sink.

### 4. Propagate and clean context

MDC/ThreadContext implementations are usually thread-bound and do not automatically cross
every executor, CompletableFuture, reactive or virtual-thread boundary. Automatic
instrumentation/frameworks may bridge some. Test the pinned stack, capture context at
submission when needed, restore only for task scope, and restore the prior map in finally.

Clearing all MDC can erase an outer framework context; use a lexical close/restore pattern.
Inheritable thread-local behavior is not a general executor solution because creation and
task lifetimes differ.

### 5. Minimize and protect data at the source

Never record credentials, session/access tokens, encryption keys or prohibited personal
data. Prefer bounded classifications, lengths and pseudonymous references. Hashing does not
necessarily anonymize low-entropy/linkable personal data.

Use layered controls: typed safe APIs, allowlists/schema validation, source minimization,
output encoding against CR/LF/delimiter injection, centralized redaction as defense in
depth, transport encryption, access controls, tamper detection where required, and timely
disposal. Encoder redaction alone cannot reliably sanitize arbitrary message strings,
Throwable messages and nested objects.

### 6. Budget and test failure

For changed cost or delivery claims, assess relevant events/operation, bytes/event, peak
ingress and storage/retention costs. Exercise representative normal and failure-path volume
when it affects the claim; stack traces and retry loops change size/rate. Select applicable
sink outage, queue/disk saturation, slow stdout, termination and malformed-input controls.
Use independent emitted/queued/dropped/blocked/failed/delayed evidence for the guarantees being
reviewed; a field-only fix need not repeat an adequate transport campaign.

## Event selection

Prefer a log when a discrete occurrence needs durable/searchable context: state transition,
security decision, administrative action, unexpected failure or diagnostic checkpoint.

Prefer a metric for aggregate rates/SLIs and a trace for causal latency topology. Define the
counted population and collection coverage; scraped/extrapolated rates are not exact ledgers.
Prefer neither when the event repeats information with no consumer, narrates every method,
or retains data whose risk exceeds its use.

Access logs at INFO can be legitimate when required and budgeted; “never one INFO per
request” is not universal. Sampling can control diagnostic volume but must preserve stated
estimators and never silently sample required audit/security records.

## Levels and error ownership

Levels are filtering/severity metadata, not automatically pager commands:

- ERROR: operation/system failure requiring investigation under policy;
- WARN: unexpected/degraded condition worth attention but not necessarily failed outcome;
- INFO: normal significant lifecycle/business event;
- DEBUG/TRACE: diagnostic detail, normally time-bounded.

Map levels to the organization's routing. A recovered retry might be DEBUG, WARN or a
security-relevant ERROR depending on impact/rate; avoid a universal “at most WARN.”

Log an exception object when stack/cause is needed and its content is permitted in that stream.
An approved bounded classification/summary can be sufficient; do not attach prohibited message
or cause data merely to obtain a stack trace. Avoid log-and-rethrow duplication by
choosing an owning boundary, but multiple records can be justified for distinct security,
audit and operational consumers if they share an event/cause identifier and do not inflate
one metric accidentally.

## Delivery decision table

| Requirement                    | Prefer                                                 | Risk to test                                 |
| ------------------------------ | ------------------------------------------------------ | -------------------------------------------- |
| lowest loss for audit          | separate durable append/transactional design           | application coupling and availability        |
| bounded app latency            | async bounded queue with declared loss policy          | dropped evidence during incidents            |
| immediate local crash evidence | synchronous/stderr or crash-safe path                  | hot-path blocking                            |
| high-volume access events      | structured buffered pipeline; sample only if permitted | queue and sink overload                      |
| container collection           | stdout/stderr when platform contract supports it       | blocking, multiline and rotation outside app |

No appender is crash-lossless by default. Async defaults vary by library/version; inspect
effective configuration instead of encoding one Logback/Log4j behavior as universal.

## Failure modes

| Symptom                          | Distinguish with                                  | Response                                            |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| stale correlation on pooled task | capture/restore fixture with interleaved requests | lexical context bridge                              |
| key-value rendered as prose      | actual encoder fixture                            | structured layout/provider                          |
| INFO vanishes under load         | queue/discard counters and config                 | tune or separate critical path                      |
| application stalls               | sink latency, stdout pipe, queue-full blocking    | bound/separate transport                            |
| duplicate stack traces           | same cause/event across layers/retries            | choose ownership/dedup fields                       |
| secrets in logs                  | source/Throwable/nested-field scan                | contain access, remove/rotate, fix layered controls |
| forged multiline event           | raw untrusted CR/LF and parser                    | encode/sanitize and length-limit                    |
| missing shutdown events          | lifecycle/flush deadline/forced kill              | explicit bounded flush; accept documented loss      |
| schema query goes empty          | field rename/type drift                           | version and dual-read migration                     |

## Anti-patterns

**Every event must have trace_id:** creates stale/fake IDs for work outside a trace.

**ERROR means page:** level and alert routing are related but separate policies.

**Redact only at encoder:** arbitrary prose, Throwable and downstream copies can bypass
field-name rules; minimize at source.

**Sample logs by trace decision universally:** can remove audit/security/error evidence and
bias log counts. Use event-class-specific policies.

**Structured equals safe:** JSON still carries secrets, oversized fields, attacker content
and costly cardinality in backend indexes.

## Cross-skill routing

- Read [fields and levels](references/fields-and-levels.md) when defining or migrating schemas.
- Read [Java logging mechanics](references/java-logging-mechanics.md) for API, context or encoder changes.
- Read [appenders and cost](references/appenders-and-cost.md) for delivery, overload or cost decisions.
- distributed-tracing-design/opentelemetry-performance for trace context.
- metrics-and-cardinality for aggregates.
- java-exception-design for exception contracts.
- slo-and-alerting for paging.

Return the requested conclusion and its evidence/limitations. For a proposed change, identify
the affected event/consumer contract, relevant configuration or fixture evidence, loss/privacy
trade-offs and checks run versus pending. A small fix needs only its concrete finding and
validation; an adequate review may conclude with no change.

## Authoritative references

- [SLF4J manual](https://www.slf4j.org/manual.html)
- [Logback appenders](https://logback.qos.ch/manual/appenders.html)
- [Log4j 2 manual](https://logging.apache.org/log4j/2.x/manual/)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [NIST SP 800-92](https://csrc.nist.gov/pubs/sp/800/92/final)
