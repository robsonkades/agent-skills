# Failure domains and availability arithmetic

## The two compositions

**Series (a required dependency).** If the request cannot succeed without every component,
the component success events are independent, and all figures use the same SLI definition
and window, availabilities multiply:

```
A_total = A1 × A2 × … × An
```

Ten dependencies at 99.9% each: `0.999^10 = 0.9900` — 99.0%, about **87 hours a year**
against the 8.8 hours a single 99.9% component would give. Five at 99.9% is already 99.5%.
The arithmetic shows why "we are 99.9% because every dependency is 99.9%" is not justified.
Without independence, request-weighted joint observations, routing and time correlation, the
product is a design approximation rather than a prediction.

**Parallel (independent redundancy).** If any one instance suffices and their failures are
independent, the _unavailabilities_ multiply:

```
q_total = q1 × q2 × … × qn        (q = 1 − A)
```

Two independent 99% replicas give `0.01 × 0.01 = 1e-4` — 99.99%. This is the only reason
redundancy works, and it holds exactly as far as independence does.

## Correlation destroys the parallel term

One useful explicit model separates a common-cause event from conditional independent
replica failures (same image, config, certificate, AZ or downstream):

```
q_total = q_common + (1 - q_common) × q_independent^n
```

Two replicas at 99.9%, where a tenth of the failure budget is common-mode
(`q_ind = 0.0009`, `q_common = 0.0001`):

```
q_total = 0.0001 + 0.9999 × 0.0009^2 ≈ 0.00010081   →  99.9899%
```

Not 99.9999%. The independent term becomes negligible beside the common cause. Common-cause
unavailability is a floor: adding replicas eventually buys capacity with almost no
availability gain. This equation is still a model; estimate its terms from incident and
request-level data rather than inventing independence.

## Worked example: an order API

| Dependency       | Availability | Required?  |
| ---------------- | ------------ | ---------- |
| Auth service     | 99.95%       | yes        |
| Product database | 99.99%       | yes        |
| Pricing service  | 99.9%        | yes        |
| Payment gateway  | 99.9%        | yes, today |
| Event broker     | 99.95%       | yes, today |

```
0.9995 × 0.9999 × 0.999 × 0.999 × 0.9995 = 0.9969   →  99.69%,  ~27 hours/year
```

Making the payment gateway optional — accept the order, queue the charge, define the degraded
behaviour and the reconciliation — removes one 0.999 term:

```
0.9995 × 0.9999 × 0.999 × 0.9995 = 0.9979   →  99.79%,  ~18 hours/year
```

Nine hours a year recovered by one design decision and no extra hardware. That is the
highest-leverage move available: **removing a dependency from the required path beats making
the dependency more reliable**, because the second is someone else's roadmap.

Four caveats matter: dependency failures are rarely independent; traffic is not distributed
uniformly; availability figures may use different windows or success criteria; and a
historical average is not a probability for next month. Retry and fallback also make path
availability conditional rather than a simple product. Use arithmetic to expose assumptions
and compare designs, then validate with request-weighted joint data and failure exercises.

## Do not add unlike SLIs

Before composing numbers, align:

- **unit:** request success, minute availability, durable-write acceptance or control-plane
  uptime are different events;
- **population:** a global dependency SLI may hide the one region or tenant your service
  uses;
- **window:** monthly and annual averages do not preserve burst correlation or error-budget
  burn;
- **load:** an idle failover success rate says little about failover at peak utilization;
- **degraded success:** decide whether stale reads, queued writes or partial responses satisfy
  the user contract.

For measured events `S_i`, the exact path availability is
`P(S_1 ∩ ... ∩ S_n)`. The product `∏P(S_i)` is valid only when those events are independent.
When possible, calculate the joint request outcome directly from traces or correlated SLI
time series. Never average percentages without the matching denominator.

## Enumerating domains

For each level, write what it takes down. If two things appear on the same row, they are one
unit for availability purposes.

| Domain                   | Takes down                                                 | Typical control                                     |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------- |
| Process                  | one replica                                                | more replicas                                       |
| Host / node              | every replica scheduled there                              | anti-affinity across nodes                          |
| Rack / failure zone      | every node in it                                           | spread across zones                                 |
| Availability zone        | everything in the AZ, including that AZ's managed services | multi-AZ, and a quorum that survives losing one     |
| Region                   | everything                                                 | a second region, with the data problem that implies |
| Dependency               | every caller of it                                         | fallback, or removal from the required path         |
| Deploy / artefact        | every replica running it                                   | staged rollout, canary, fast rollback               |
| Config / feature flag    | every replica reading it                                   | staged config rollout — the same discipline as code |
| Certificate / credential | everything that presents it                                | staggered expiries, automated renewal               |

Deploy and config deserve emphasis: they are the two domains that reach every replica
simultaneously and are the two most often left out of a redundancy diagram.

## Questions that expose a hidden shared dependency

Ask these of a topology that claims independence. Each has produced a real correlated
outage:

- Do the replicas run on the same node, the same node group, or nodes created from the same
  image at the same time?
- Do they resolve the same hostname, and is the resolver itself redundant? DNS and service
  discovery are dependencies of _every_ call.
- Do they share a database, a cache, a secret store, or a single connection-pool target?
  A read replica that fails over to the same primary is one database.
- Do they share a control plane — the scheduler, the load balancer, the API gateway, the
  service mesh control plane? A mesh whose control plane is down usually keeps serving with a
  stale config, but new pods cannot join.
- Do they share an authentication provider, and does that provider have its own dependency
  chain you have never drawn?
- Do they use the same client library, with the same default timeout and the same bug?
- Does an incident in the observability stack blind you to all of them at once?
- Do they share a certificate, a signing key, or a licence with a single expiry date?
- Does the retry policy make every replica hammer the same slow dependency at the same
  moment? That is a correlated failure the system creates for itself; how it propagates is
  `cascading-failures`.

## The check to run

Before accepting a redundancy claim, name the single event that takes down the whole set. If
you cannot name one, you have not looked hard enough — try the deploy, the config change, and
the certificate.

## Primary references

- [Google SRE Workbook: Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- [NIST SP 800-160 Vol. 2 Rev. 1: cyber-resilient systems](https://csrc.nist.gov/pubs/sp/800/160/v2/r1/final)
- [Gray Failure: The Achilles' Heel of Cloud-Scale Systems](https://www.microsoft.com/en-us/research/publication/gray-failure-achilles-heel-cloud-scale-systems/)
