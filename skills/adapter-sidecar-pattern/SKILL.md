---
name: adapter-sidecar-pattern
description: >
  Choose and review Kubernetes telemetry adapters when a legacy or vendor process emits
  incompatible metrics, logs or health signals, when deciding between per-pod translation
  and a node agent, or when an application upgrade silently changes parsed telemetry.
  Covers translation contracts, evidence-backed enrichment and failure behavior. Excludes
  in-process interface adaptation (gof-adapter), container mechanics (sidecar-pattern),
  probe configuration (kubernetes-service-lifecycle) and telemetry instrumentation design.
---

# Adapter Sidecar Pattern

An adapter translates what a process emits into a platform contract. Uniform syntax does
not imply uniform meaning: two duration metrics may include different work. The specialist
decision is whether translation is justified, where it belongs, and how to detect plausible
but incorrect output when either contract changes.

## Workflow

1. **Establish the contract before the parser.** Obtain representative source samples with
   producer image/version and capture conditions, the consumer schema/protocol and version,
   field meanings and units, and the current collection path. Inspect source/configuration
   where available; do not infer semantics from field names alone. For placement, obtain
   producer changeability, collector capabilities/access, replica counts and resource constraints.
   For failures, obtain timestamps, parser errors, backlog and upstream collection status.
2. **Handle missing evidence explicitly.** Request the smallest missing sample or contract
   needed for a decision. Continue with a conditional design, but do not invent a production
   parser, health predicate, resource budget or confirmed diagnosis. Label supplied facts,
   inferred explanations and untested hypotheses separately; name a check that could refute
   each consequential hypothesis.
3. **Choose the least costly adequate placement.** Before adding a container or revisiting
   log collection, read [adapter-or-node-agent.md](references/adapter-or-node-agent.md).
   Workload-specific parsing and pod metadata alone do not require a sidecar. Record the
   constraint that the existing collector or producer cannot satisfy. Use `sidecar-pattern`
   for container mechanics only once per-pod placement is justified.
4. **Specify translation and failure behavior.** When implementing, reviewing or diagnosing
   an adapter, read [coupling-and-failure.md](references/coupling-and-failure.md). Map source
   fields to output meaning, including absent/invalid values, enrichment provenance, and
   compatibility ownership. Define what consumers see on malformed input, stale collection
   and overload; never silently convert missing data to a successful zero or healthy state.
5. **Verify semantics and the failure path.** Use producer-version fixtures and consumer
   tooling to check both valid output and its meaning. Include the relevant failure injection
   (format drift, source outage, restart or sink outage). Record actual results separately
   from proposed checks. Parser acceptance alone cannot prove correctness.

## Rules

- Compare changing a controlled producer or using existing instrumentation with recurring
  adapter maintenance; ownership makes change possible, not automatically cheaper.
- Parsing may target a documented versioned API or an informal log layout. Record which,
  the supported producer/adapter combinations, and who tests upgrades. Do not assume either
  stability or absence of ownership.
- Enrichment needs an authoritative source and an unambiguous association to the record.
  Never fabricate request context or infer it from temporal proximity. Missing information
  stays missing unless the output contract explicitly defines a fallback with provenance.
- Treat translation as a data boundary: redact secrets before export or quarantine, restrict
  file/endpoint access, authenticate remote sinks, and bound record size, parser work and
  output amplification. Test hostile input without copying real secrets into fixtures.
- Version the mapping and test consumer compatibility. Emit schema metadata only through a
  mechanism the target protocol supports; adding a field does not force consumers to reject
  incompatible data.

## Deliverable

For a small review, a concise finding is enough: evidence (or gap), consequence, proposed
adjustment and confirming/refuting check. For a design or implementation, also provide the
placement rationale, field/semantic mapping, failure policy and compatibility tests. State
what ran and what remains unverified; do not claim a deployment fix from static analysis.

For worked decision boundaries or when evaluating this skill's decisions, use
[validation-cases.md](references/validation-cases.md). These teaching cases include expected
behavior; they are known examples, distinct from tests of an adapter implementation.
