# Behavioral validation cases

Status: documented, not executed. These evaluate skill decisions, not application tests or
fitness functions. No measured improvement is claimed.

Run each request/context in a fresh session, without the expectations below. For comparison,
keep model/version, settings, tools and surrounding instructions the same; omit this skill in
the baseline and provide SKILL.md plus its three technical references in the treatment. Keep
this evaluation file and its expectations unavailable to task-runner agents. Record outputs,
tool use and pass/fail against each required characteristic with evidence. For selection cases,
provide the same neighboring descriptions, adding this description only in the treatment.
Judge decisions and preserved requirements, not exact wording. Paired runs remain pending.

## 1. Representative elicitation

**Request/context:** “Derive drivers for order acceptance. Product requires no loss after an
order is acknowledged, and a 2-second confirmation at the forecast peak. Operations expects
capacity to double in a year; launch campaigns are announced a week ahead. Reporting may lag
acceptance by 15 minutes in normal operation. The service has no production history yet.
An architect suggests microservices as another quality driver, hoping teams can release
independently. Platform policy mandates Java 17 for this launch.”

**Expected behavior:** Separate acceptance durability, response time, growth and reporting
freshness; treat forecasts as assumptions and investigate whether resource adjustment is needed.
Distinguish the microservices preference from its intended release outcome and the mandated
Java version; no implementation selection or runtime upgrade is needed to elicit drivers.

**Required output:** Scoped candidates tied to supplied evidence, observable scenarios, provisional
priorities and missing failure/load details. Reporting delay does not remove its requirement.
Keep Java 17 as a sourced constraint and independent releases as a candidate scenario to confirm.

**Failure:** Inventing measured baseline traffic, declaring elasticity mandatory solely from a
peak, dropping integrity because reporting tolerates delay, selecting a saga without analysis,
ranking microservices as a quality, or upgrading Java to perform this exercise.

## 2. The fourth driver and missing measurement

**Request/context:** “Our selected seven drivers are availability, performance, deployability,
auditability, recoverability, interoperability and maintainability. The first three are highlighted.
Auditability is a mandatory contractual requirement, but its evidence capture is not designed yet.
Move all four lower priorities to Others Considered and stop considering auditability until there
is an automated test.”

**Expected behavior:** Preserve the full driver set and the mandatory obligation; identify the
audit scenario/evidence gap without claiming it has been satisfied.

**Required output:** Top focus distinguished from retained drivers; audit evidence owner/next
check; no numerical cap used as a waiver.

**Failure:** Deleting drivers four through seven, dismissing auditability for missing automation,
or inventing approval or a contractual interpretation.

## 3. Apparent CAP conflict

**Request/context:** “Keep strong consistency for balance updates and high availability as
drivers. During a partition, balance updates may reject; product browsing must keep working from
a cache. Tell us whether CAP means one driver must be removed.”

**Expected behavior:** Scope the operations and distinguish the stated partition behavior from
CAP's all-request availability guarantee.

**Required output:** Both concerns may remain; balance-update consistency semantics and browsing
staleness/success targets need definition. No global trade-off inferred from names alone.

**Failure:** Forced removal, claiming scalability requires eventual consistency, or promising
linearizable always-available updates on every partitioned node.

## 4. Composite labels and stakeholder disagreement

**Request/context:** “Operations calls reliability recovery within 10 minutes after a node loss.
Finance calls it no duplicate charges. Keep reliability as our umbrella. We have no agreed charge
identity or retry contract. Also, one stakeholder says delivery speed is most important and another
says reporting freshness is. They have not agreed to trade either away.”

**Expected behavior:** Preserve the umbrella with separate scenarios, surface missing charge
semantics and unresolved priorities, and identify who can resolve them.

**Required output:** Evidence/assumptions distinguished, no double-counted parent/child priorities,
and specific next questions rather than invented consensus.

**Failure:** Rejecting reliability solely because it is composite, substituting a fixed five-part
definition, or stating that a saga guarantees charge integrity.

## 5. Scope is not deployable count

**Request/context:** “We have four services with one shared schema and coordinated releases.
Checkout calls all four synchronously. Create four independent quantum lists and mark each
service available if its own health endpoint works. Checkout availability is a business obligation.”

**Expected behavior:** Retain the end-to-end obligation and treat quantum boundaries as unresolved
pending coupling analysis. Local scopes can still be described without claiming independence.

**Required output:** Dependency/release evidence requested or handed to architecture-coupling-and-quanta;
checkout success distinguished from local health.

**Failure:** Inferring four independent quanta from four deployments or replacing journey
availability with per-service health checks.

## 6. ISO vocabulary pressure

**Request/context:** “The contract cites ISO/IEC 25010:2011 portability. We only have public
abstracts. Rewrite it as the equivalent 2023 clause, certify compliance, and omit our burst-response
requirement because ISO has no category called elasticity.”

**Expected behavior:** Preserve the named requirement/edition and burst scenario; state limits
of abstract-only evidence and offer a provisional mapping pending applicable text.

**Required output:** No invented clause/equivalence, no compliance certification, and a clear
request for the contractual definition and exact standard text needed for review.

**Failure:** Silent edition substitution, claiming lack of a label makes a scenario inexpressible,
or treating ISO solely as finished-product evaluation.

## 7. Scope boundary

**Request/context:** “Availability scenarios and priorities are already approved. Implement
Prometheus burn-rate alerts for our agreed SLO. Do not revisit the driver list.”

**Expected behavior:** Hand off to slo-and-alerting; do not reopen prioritization.

**Required output:** Respect the approved list and focus on operational alerting inputs.

**Failure:** Forcing a three-driver exercise or an architecture worksheet before alert work.
