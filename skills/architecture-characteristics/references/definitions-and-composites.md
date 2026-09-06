# Definitions that distinguish decisions

Use working definitions agreed for the current system. The
[Richards worksheet](https://www.developertoarchitect.com/downloads/architecture-characteristics-worksheet.pdf)
is one vocabulary: it pairs related qualities and illustrates reliability and agility as
composites. Its wording is not a universal technical definition. The questions below are
operational guidance, not quotations or fixed decompositions.

## Related qualities

| Pair                           | Distinction to establish                                                                                                        | Evidence or scenario to request                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Performance / responsiveness   | Processing completion versus user-visible response; performance may also include throughput/resource use in other vocabularies  | Start/end events, completed work versus acknowledgement, latency distribution, workload and errors                                      |
| Scalability / elasticity       | Capacity as workload/resources grow versus adjusting resources to changing demand within an acceptable time and cost            | Growth forecast, ramp duration, provisioning lag, limits, scale-in behavior and load targets                                            |
| Availability / fault tolerance | Delivery of a defined service under specified conditions versus ability to continue acceptable service despite specified faults | Eligible operations, success criteria, measurement window, fault model and acceptable degraded functions                                |
| Integrity / consistency        | Invariants, corruption/loss and unauthorized change versus specified agreement or ordering of observations                      | Data invariant, accepted/durable boundary, readers/writers, transaction/isolation or replication model and permitted stale observations |
| Adaptability / extensibility   | A changed environment or usage versus added behavior; these may overlap                                                         | A concrete anticipated change, affected interfaces and acceptable effort/time                                                           |

A large peak-to-median ratio alone does not prove an elasticity requirement: duration, warning
time, available capacity and resource adjustment determine the decision. A predictable burst may
be pre-provisioned. Scaling and elasticity can coexist with strong consistency; the labels do
not select replication or transaction protocols.

Batching can improve throughput while delaying individual responses; it need not improve every
performance measure. An early acknowledgement may improve perceived response time while total
completion slows or fails. It does not automatically change data consistency: define what the
acknowledgement promises and when the state change becomes visible.

Fault tolerance can support availability. A degraded feature is successful only if the agreed
service definition permits it; neither replicas nor a bare uptime percentage proves the target.
Evaluate required journeys and faults, not a single undifferentiated “system up” signal.

## Consistency needs a model and a failure condition

“Consistent” might mean a business invariant, atomic multi-item updates, isolation between
transactions, linearizable reads/writes, or bounded replica staleness. These are not interchangeable.
A tolerable delay for reporting does not waive integrity or consistency requirements for accepting
a payment. Specify each operation and failure mode.

[Gilbert and Lynch's CAP result](https://www.comp.nus.edu.sg/~gilbert/pubs/BrewersConjecture-SigAct.pdf)
concerns linearizable objects, responses to requests at non-failing nodes, and partitions in
its network model. It is not a general prohibition on naming availability and consistency as
drivers, and its availability definition is not an uptime SLO. When both are requested, establish
what must happen during a partition and which operations may reject, wait or return stale data.
If requirements demand incompatible guarantees in that setting, expose the conflict without
choosing a business concession yourself.

A saga coordinates local transactions; it does not provide automatic cross-service isolation.
Concurrent execution, failed compensation and lost/duplicated work can threaten business
invariants. Ask which invariants must hold during intermediate states and after recovery.
[Microsoft's saga guidance](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga)
documents these anomaly risks. Choosing a saga or atomic protocol is outside this skill.

## Composites and custom names

Retain a stakeholder umbrella when it helps communication, but attach concrete outcomes and avoid
double counting its children. “Reliability” might include successful operation, recovery, data
durability and fault handling. “Agility” might concern change lead time, test feedback or deployment.
The relevant decomposition depends on the user's meaning; a familiar template may miss the
actual concern.

Do not claim composites cannot be measured. An umbrella can have an operational measure or a
set of scenario measures; aggregate scores can hide a failed dimension. Record which outcomes
are mandatory and inspect their individual results. No top-level label substitutes for that work.

Custom terms such as auditability are acceptable if defined: whose action must be reconstructed,
from which records, under what access/retention conditions and with what completeness?
Do not force them into a taxonomy at the cost of losing the requirement.

Concurrency is not FIFO ordering, fairness or freedom from interference. Even when capacity work
already implies concurrent execution, preserve separately required ordering, isolation or fairness
scenarios. Only merge duplicate requirements when their scope and acceptance conditions match.

For recoverability, distinguish restoration time, tolerable data loss and the failure being
recovered from. Business continuity may also involve operations outside software. Do not infer
recovery targets from an uptime percentage or treat a process restart as disaster recovery.
