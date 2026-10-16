# Worked analysis: payment processing boundaries

Read when a generic topology comparison needs to become a decision with explicit
conditions. This is an **illustrative analysis with stipulated inputs**, not a quotation
from a book, a benchmark, or a validated production recommendation.

## 1. Bound the question and evidence

Question: should the existing payment application keep its shared implementation,
introduce internal payment-type modules, or deploy a service per payment type?

Illustrative inputs supplied by the team:

- One existing payment deployable and an application-owned payment-state database.
- Card and reward-point payments, including orders that combine both.
- Payment-type changes currently release together; independent release is desired, but
  no delay/incident history demonstrates that coordinated release is the current bottleneck.
- External payment providers cannot participate in the application's local database
  transaction. An unknown provider outcome must be reconciled before retrying an effect.
- The required behavior is no duplicate financial effect for a retried operation, an
  observable outcome for each leg, and an explicit partial-failure policy for mixed payments.
- No comparable performance measurements or accepted operating-cost estimates are available.

These inputs support mode B, with targeted C if an uncertain quantity becomes decisive.
They do not establish that a split or a monolith is faster. Missing evidence is not
permission to invent latency numbers or treat a risk as a demonstrated incident.

## 2. Describe complete candidates

| Candidate                                    | Deployment and state                                                | Relevant consequences to investigate                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A — retain the current shared implementation | Existing deployable/database, shared payment code                   | Least migration work; changes remain coupled in code and release                                         |
| B — internal payment-type modules            | Same deployable and state owner, explicit module interfaces         | Can reduce code-change overlap; still one release and shared resource/failure exposure                   |
| C — per-type services                        | Separate deployment/state ownership, coordinator for mixed payments | Can permit independent releases if contracts allow; adds network, workflow and recovery responsibilities |

A centralized coordinator with selectively extracted handlers is another credible staged
option if a particular type needs independent operation. It is not an automatic improvement:
identify which boundary changes and what coordination remains. Do not enumerate every
possible topology if none would alter the recommendation.

The alternatives differ on both code organization and deployment. Make that visible:
if comparing B and C to isolate deployment effects, hold the logical module interfaces and
required behavior comparable. Do not credit extraction for all benefits of modularization.

## 3. Separate obligations from ranking

No duplicate effect and correct handling of partial/unknown outcomes are obligations for
**every** candidate, including A. Independent release and reduced operating effort are
preferences unless stakeholders establish them as mandatory requirements.

Create an obligation check for each candidate rather than granting compliance by topology:

- What identifies the same operation across retries?
- Where is progress durable, and what happens after a crash or ambiguous timeout?
- Which effects can be reversed or compensated, with what limits and owner?
- Can the system observe conflicting or partial outcomes and complete reconciliation?

A single process can use a local transaction for its local state **only within that
transaction's actual scope**. It does not make two external provider effects atomic.
Separate services need an explicit cross-service consistency/recovery design; a saga is
not a transparent rollback or isolated transaction. AWS's
[saga considerations](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-orchestration.html)
identify idempotency, compensation complexity and lack of transaction isolation.
Detailed transaction design must be established before implementation approval.

## 4. Apply the same scenarios

| Scenario                                         | A / B                                                                             | C                                                                                        | Evidence needed before concluding                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Update card processing without changing rewards  | Shared release; B may narrow code/test scope                                      | Independent release is possible if coordinator/contracts remain compatible               | Actual change diff, contract tests and deployment dependencies                  |
| Add a new payment type                           | Extend shared implementation or add a module; shared release                      | Add service and integrate routing, state visibility and operations                       | Expected change frequency, provisioning/support work and contract evolution     |
| Pay with card plus rewards; second leg fails     | Local state can be coordinated together, but external effects still need recovery | Coordinator must manage distributed progress and recovery                                | Failure traces, retry/reconciliation design and business partial-failure policy |
| A provider responds slowly or loses its response | Need bounded resources and outcome reconciliation                                 | Deployment separation alone does not bound coordinator wait or prevent duplicate retries | Timeout/idempotency behavior, isolation tests and completion metrics            |

The first two scenarios make release independence attractive; the latter two expose costs
shared by all options and extra coordination in C. They need not reverse a ranking.
The output is a mechanism-based comparison, not generic High/Low labels for “consistency”
or a claim that more coupling always means less scalability.

## 5. Give a conditional recommendation

These inputs do not yet justify paying B's refactoring cost over A: shared release alone
does not establish harmful code-change overlap. Have the payment owner review representative
recent changes and estimate the proposed module boundary's migration/test cost. If that
review identifies material overlap that B can reduce at worthwhile cost, prefer **B as the
next design direction**. Its accepted costs are a shared deployment, potential shared-resource
contention and the refactoring itself; this does not establish rollout readiness.

A is still reasonable if change overlap is negligible or the internal refactor's cost
exceeds its benefit, subject to the same obligation checks. C becomes more compelling if
concrete release contention, isolation
or ownership needs outweigh its extra operating and recovery costs. Keep those preference
conditions visible; do not promise that a future extraction from B will be cheap.

Before implementation, validate the invariants and failure behavior above. If performance
separates the options, compare equal completed-payment semantics under the same workload
and resource/cost basis, including mixed-payment and failure cases. If a candidate cannot
meet a mandatory obligation, exclude or revise it regardless of its release advantage.

Useful review signals include demonstrated cross-type change contention, an accepted
independent-release requirement, or evidence of resource interference. Each needs an
observer and evidence source. A service deploying at twice an estate median is not proof
of wrong ownership; product demand and team practices can explain the same metric.

## 6. Do not hide acknowledgement semantics in the summary

A related choice is how a client waits for payment or credit-approval work:

| Interaction                               | What a successful response establishes                                                            | Failure/cost that remains                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Wait for a synchronous response           | Only what the API contract commits before that response: acceptance, start, or completion         | Timeouts may leave an unknown outcome; client wait depends on the contracted work |
| Durably accept and process asynchronously | Accepted work if persistence/acknowledgement guarantees support it; not started or completed work | Backlog, broker/storage availability, retries, status delivery and recovery       |

Async submission can return promptly while completion takes longer; it is not “no wait”
or independence from every dependency. A synchronous call does not guarantee immediate
start merely by being synchronous. Microsoft's
[asynchronous request-reply pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/asynchronous-request-reply)
separates acceptance from eventual completion and status retrieval.

A useful stakeholder question is: “Must this interaction return a completed result, or
can it return durable acceptance and expose completion later, within which bound?”
If acceptance, completion time and operating cost are all independently constrained, keep
all three visible. Do not collapse them into “speed versus consistency” and lose the
required behavior. Carry the resulting recommendation and evidence into an ADR only when
that additional artifact is requested or required by local practice.
