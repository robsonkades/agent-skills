# Failure domains and availability arithmetic

## The two compositions

**Series (a required dependency).** If the request cannot succeed without it, availabilities
multiply:

```
A_total = A1 × A2 × … × An
```

Ten dependencies at 99.9% each: `0.999^10 = 0.9900` — 99.0%, about **87 hours a year**
against the 8.8 hours a single 99.9% component would give. Five at 99.9% is already 99.5%.
The arithmetic is why "we are 99.9% because all our dependencies are 99.9%" is always wrong
in the same direction.

**Parallel (independent redundancy).** If any one instance suffices and their failures are
independent, the _unavailabilities_ multiply:

```
q_total = q1 × q2 × … × qn        (q = 1 − A)
```

Two independent 99% replicas give `0.01 × 0.01 = 1e-4` — 99.99%. This is the only reason
redundancy works, and it holds exactly as far as independence does.

## Correlation destroys the parallel term

Split each replica's unavailability into an independent part and a common-mode part shared
with its peers (same image, same config, same certificate, same AZ, same downstream):

```
q_total ≈ q_independent^n + q_common
```

Two replicas at 99.9%, where a tenth of the failure budget is common-mode
(`q_ind = 0.0009`, `q_common = 0.0001`):

```
q_total ≈ 0.0009^2 + 0.0001 = 0.00000081 + 0.0001 ≈ 0.0001   →  99.99%
```

Not 99.9999%. The independent term vanished; the answer is the shared term and nothing else.
**A parallel composition is capped by its largest correlated component**, so adding replicas
past that point buys capacity, not availability. Report the cap, not the multiplication.

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

Two honest caveats on all of this: the numbers assume independence between the listed
dependencies (rarely true — they often share a network or a cloud region), and a published
availability figure is a historical average, not a probability for next month. Use the
arithmetic to compare designs, not to promise a number to a customer.

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
