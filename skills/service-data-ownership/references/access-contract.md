# From authority to an access contract

Read when inventorying consumers, deciding what another service may read or write, or
replacing a permanent-looking exception. These examples are architectural illustrations,
not records of an executed migration or test.

## Start with the decision, not the table

Ask who may accept, reject and correct the fact. Stock availability belongs with the
reservation invariant; an order's accepted reservation identifier can belong to Orders.
Both may retain the same identifier while having different obligations. A copy of a
customer name on an issued invoice may be a legally significant historical snapshot,
not a cache to overwrite whenever the customer's profile changes.

For derived data, name its source, permitted local transformations, correction/deletion
path, custodian and retention. A projection writer may update its local representation
without being allowed to invent source facts or write corrections back upstream. Record
which replica may be promoted to authority and only under a defined ownership-transfer
protocol; replication by itself confers no authority.

Discover access using complementary evidence:

- Code and deployment configuration identify intended repositories, clients and principals.
- Database effective privileges expose reachable operations, including inherited roles,
  functions, foreign tables and direct grants absent from source configuration.
- Audit/query records reveal observed use during a stated window. A month with no yearly
  reconciliation run cannot prove that the reconciliation principal is unused.
- Deployment/scheduler inventories, CDC connectors, support runbooks and data-platform
  contracts reveal paths absent from the service repository.

Report principal identifiers and secret references, never secret values. Distinguish
"not observed" from "denied" and "unknown" from "approved". Complete known rows while
requesting only the missing evidence needed for the consequential decision.

## A contract row that can be tested

Use the project's existing artifact format. Capture these fields when relevant:

| Field                     | What must be decidable                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fact and authority        | Which invariant/source fact, who decides it, and who handles corrections                                   |
| Consumer and principal    | Deployed service/job/connector/script identity; environment and tenant scope                               |
| Allowed action            | Read/command/maintenance, exact fields or objects, business purpose                                        |
| Supported interface       | Operation/event/export/view and its owning team; compatibility/deprecation policy                          |
| Consistency and lifecycle | Freshness/snapshot meaning, deletion/correction/retention obligations; whether reads may authorise effects |
| Enforcement               | Credential/role, object grants, endpoint/broker policy, deployment artifact, privileged escape paths       |
| Proof                     | Allowed operation plus prohibited operation using the real identity shape; last observed result            |
| Exception                 | Approval/owner, scope, expiry, replacement, revocation action and verification                             |

An interface may be logically supported without physical separation. A SQL view contract
needs explicit output columns, meanings and compatibility obligations; a convenient view
over arbitrary internal tables is not automatically a stable public interface. Record its
availability dependency, query/resource budget and access to sensitive fields. Do not
mistake read-only access for harmless access: a reader can expose restricted data, impose
load or prevent compatible schema changes through undocumented assumptions.

For access via API or events, an owner must still approve callers, operations, field scope
and tenant semantics. A broker subscription cannot be treated as temporary access if the
consumer retains an uncontrolled copy forever. State downstream deletion/correction
obligations and whether existing copies can actually be revoked.

Classify a CDC source as a reader of captured data and a sink as a writer of its local
copy; neither label alone defines business authority. Inspect snapshot/replication
privileges and downstream destinations. A connector's table filter is not necessarily
an access-control boundary, and raw row changes do not automatically become a supported
business event contract. Keep capture/replay mechanics with the CDC specialist.

## Worked ownership decision: Orders and Billing

Observed: Orders is documented as authority for accepted quantities. Billing's nightly
job reads `orders.order_line` using `application_admin`; that credential can also update
quantities. The job is outside the Orders repository. The same database hosts both
services. The report needs accepted quantity and price snapshots, not live reservation
decisions. These are stipulated facts for this illustration.

The immediate defect is reachable unauthorised mutation and an undocumented dependency,
not the presence of one database server. First identify other uses of the shared principal.
Compare an already supported order export/API with a deliberately supported SQL read
surface. If either meets the consumer's snapshot, load and availability requirements,
reuse it; do not create messaging infrastructure merely to remove a join.

An acceptable target could be an Orders-owned `billing_order_v1` view exposing only the
agreed fields, with a Billing job principal granted only that read path. Orders accepts
versioning obligations for the view. Test the report and denials of base-table access,
quantity mutation and privilege escalation. Read-surface implementation details depend on
the engine's view security semantics; see the enforcement reference routed by SKILL.md.

If the supported export already satisfies the task, prefer migrating the job to it and
removing database access instead. If Billing now needs a decision that consumes a scarce
reservation atomically, the previous report contract is insufficient even if it looks
fresh: invoke the authority's operation and resolve concurrency there. Keeping the same
table/view because it worked for reporting would miss the changed invariant.

## Temporary access is a lifecycle

A defensible exception has a named principal, exact allowed objects/columns/actions,
business reason, accountable data owner, consuming owner, expiration instant/timezone,
replacement milestone and removal mechanism. A calendar date in a ticket is not access
revocation. Track scheduled revocation or expiring policy/lease, monitoring if it fails,
and the verification owner. If the platform lacks automatic expiry, use an assigned,
observable revocation action and state that lapse is possible; do not claim automatic
enforcement. Renew only with a newly bounded scope and reason, not silent rollover.

Before narrowing access, exercise the replacement and identify incomplete jobs that need
controlled draining/reconciliation. At expiry, remove reachable privileges and obsolete
secret access, verify new connections and already-open pools, and check no inherited role
or alternate account restores the path. Password expiry alone may not revoke active
sessions or non-password authentication. Return to the engine-specific contract before
claiming revocation.

Emergency repair access is also an exception: identify the invariant checks bypassed,
authorised operator/job, audit trail and required reconciliation. Do not disguise a
permanent second writer as "support". Recovery should restore the supported path or a
bounded emergency permission; blanket restoration of an admin credential reopens the
original defect.

## Evidence that closes the contract

Choose checks for the actual claim, using the target engine and permission model:

- A supported reader gets exactly the permitted fields/tenant rows; its matching direct
  base-table access is denied when that is the agreed boundary.
- A job that can read cannot mutate source facts, call privileged mutation functions,
  assume a writer/owner role, or create an object that changes trusted query resolution.
- The authoritative writer still completes valid commands and rejects invalid invariant
  changes; a grant change has not merely stopped the whole service.
- Newly created objects preserve the boundary, and an expired exception loses access
  through both new and existing sessions according to the specified revocation objective.

When inspecting a design only, supply these as acceptance cases. When implementing,
execute applicable checks in an isolated environment and report missing runtime coverage.
No number of completed matrix rows establishes enforcement without the relevant evidence.
