# Behavioral validation cases

Status: documented, not executed. These evaluate skill decisions, not application tests or
fitness functions. No measured improvement is claimed.

These shipped cases are teaching and regression material; an agent can encounter their expected
answers. A walkthrough or a run with that exposure does not establish independent improvement.
For behavioral comparisons, prepare separate task inputs and evaluator-only criteria, use fresh
sessions and keep model/version, settings, tools and surrounding instructions comparable. Compare
the original and revised packages on the same tasks when attributing an effect to this revision;
a no-skill baseline answers a different question. Provide ordinary package resources as shipped.
If a harness withholds this file, disclose that restriction and limit claims to that configuration.
Record outputs, tool use and judgments against observable requirements, not exact wording.
For selection cases, keep neighboring descriptions constant. Paired runs remain pending.

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

## 8. Same target, different exception authority

**Request/context A:** “Document drivers for image ingestion. The approved requirement says each
accepted image is durably stored and its preview completed within 30 seconds, including a thumbnail
dependency outage. The team now proposes returning a receipt and completing previews after recovery.
Treat that as our existing graceful-degradation requirement.”

**Request/context B:** The same request, except the approved requirement explicitly permits delayed
preview completion during that dependency outage while retaining durable storage of accepted images.
No outage receipt or post-recovery completion target is recorded.

**Expected behavior:** In A, retain the 30-second obligation and identify the proposal as an
unapproved change with unresolved feasibility. In B, separate normal and outage scenarios, preserve
durability, and request the missing acknowledgement/recovery measures. Neither case chooses a queue
or claims the target is technically achievable.

**Required output:** The authority difference changes the acceptance statement; both outcomes
identify the owner and missing evidence without inventing new thresholds.

**Failure:** Inferring permission from the team's current behavior, refusing the explicit exception
in B, treating a receipt as a completed preview, or waiving durability during the outage.

## 9. Reuse approved decisions and survive an unavailable handoff

**Request/context:** “The product and operations owners approved these report-export drivers last
month: performance (95% of jobs finish within 60 seconds from acceptance during healthy operation,
for at most 100,000 rows per job and 10 simultaneous jobs); recoverability (an accepted job remains
recoverable after a single worker-process failure, though its completion-time target then is pending).
Nothing relevant has changed. Prepare these scenarios for fitness-check design; do not re-rank them.
The architecture-fitness-functions skill is unavailable.”

**Expected behavior:** Reuse the supplied priorities and provide scoped scenarios, constraints,
evidence and unresolved verification questions. Identify the needed verification-design result
without claiming the checks have been designed or executed. No new workshop is needed.

**Required output:** A usable handoff even without the neighboring skill, with no invented approval
or mandatory extra artifact.

**Failure:** Blocking all progress on skill availability, asking the user to repeat supplied
requirements, or changing priorities merely because the review is occurring again.

**Variant:** Evidence now shows a newly required operating mode outside the approved scenarios.
Reopen that affected scenario and its priority implications while retaining unaffected decisions;
blindly reusing the list is now a failure.
