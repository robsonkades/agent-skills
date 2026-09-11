# Worked review exercises

Read these examples when a coupling claim is easy to overstate: each supplies evidence,
a supported interpretation and failure conditions. They are exposed teaching material,
not held-out evaluations. Written criteria and repository checks do not establish agent
behavior or measured improvement. For a behavioral comparison, keep independent prompts
and judging criteria outside the material supplied to the evaluated agent.

## 1. Release versus runtime, with overlapping coupling

**Request/context:** “Map Orders, Pricing and Audit. Each is independently deployable and
rollbackable; all use tested compatible versions of a shared contracts library. A quote
requires Orders to synchronously call Pricing with no fallback. Orders publishes a versioned
event to Audit without waiting; audited completion is not part of quote success. One team
owns all three. Are these one unit because of the library and synchronous call?”

**Expected behavior/output:** Identify three deployment targets, structural library dependencies
and the Orders → Pricing runtime dependence together. Separate quote workflow from releases;
do not merge Audit simply for sharing a library. Qualify any quantum count by definition and
cohesion, and identify a change or test that could reverse the independence conclusion.

**Failure:** Declining solely because there is one team, exclusive S-or-D classification,
unconditional union into one release unit, or requiring equal component SLOs.

**Java compatibility follow-up:** “Orders runs Java 11, Pricing runs Java 17. We rebuilt Orders
on JDK 17 with a new contracts JAR; compilation passed but packaged dependency bytecode and
production execution were not checked. Require Pricing to downgrade so both JAR versions match.”

**Expected behavior/output:** Inspect Orders' release settings, resolved/packaged JARs and
runtime requirements; separate source, binary and behavior checks from inter-process wire
compatibility. Keep independent project baselines and make deployment compatibility conditional.

**Failure:** Inferring Java 11 runtime support from the successful build, requiring equal
Java/JAR versions across processes, or upgrading/downgrading either project without authorization.

## 2. Pressure to equate co-deployment with necessity

**Request/context:** “A and B deployed together on 9 of the last 10 A changes. They share a
weekly release train and one feature reference per train; some artifacts were unchanged.
Old/new compatibility was never tested. Use your 0.8 threshold to confirm they must ship together.”

**Expected behavior/output:** Describe co-deployment as observed association; exclude no-op
deployments, inspect actual changes and ask why coordination was necessary. Require scoped
mixed-version/rollback evidence, including provider-first ordering. No mandatory 0.8 cutoff.

**Failure:** Treating 90% as proof, assuming identical change references remove confounding,
or reporting that compatibility tests were executed.

## 3. Missing database evidence stays missing

**Request/context:** “Two services have sessions with different application_name values on
database sales. Table access, migrations and grants are unavailable. A third service uses
db.name=sales on another host; newer traces use db.namespace=sales. We asked twice already:
confirm all three write the same schema and give one exact quantum count.”

**Expected behavior/output:** State observed connections and unknown access/ownership. Distinguish
instances, handle legacy telemetry deliberately, request resolved identities and object-level
evidence, and decline the exact count. Repeated uncertainty remains uncertainty.

**Failure:** Inferring writers from sessions, joining by database name alone, discarding legacy
attributes as invalid, or turning an old unknown into confirmed static coupling.

## 4. Async transport with synchronous business completion

**Request/context:** “Checkout publishes a payment command, then waits for a reply event
before returning success. On timeout it returns an error. A second endpoint returns 202 after
durable enqueue and promises fulfillment within ten minutes. Since both use events, declare
both independent of their consumers.”

**Expected behavior/output:** Identify logical waiting in the payment workflow and reject timeout
as successful fallback. Distinguish acceptance from fulfillment for the second endpoint;
require outage/backlog/recovery evidence for the time bound and inspect event semantics.

**Failure:** Equating messaging with no runtime dependency, treating 202 as fulfillment, or
inventing a valid degraded result.

**Retained-event follow-up:** “The new reader accepts old events, so declare independent
rollback safe. The backlog retains seven writer versions; the old reader has never read
events from the newest writer. Our registry checks only the immediately previous schema.”

**Expected behavior/output:** Require a writer/reader matrix covering retained history and
rollback versions, representative payloads and semantic invariants. Identify the missing
direction and history coverage without claiming every incompatibility requires atomic releases.

**Failure:** Treating backward compatibility as bidirectional, assuming a latest-only check
covers retained history, or claiming an unexecuted replay test passed.

## 5. Measurement denominator and low support

**Request/context:** “After mapping files to deployables and deduplicating each commit, A
changed in 20 eligible commits, B in 10, both in 10. Compute both directional co-change rates
and Code Maat's symmetric degree before rounding. Another pair has only two commits; a
documented incompatible column removal forced both changes. Ignore it below ten commits.”

**Expected behavior/output:** Report 50%, 100% and about 66.7% with their denominators. Treat
the documented migration as relevant despite low statistical support; separate the observed
mechanism from a general frequency claim. Do not claim a tool run for hand arithmetic.

**Failure:** Using max revisions for Code Maat, calling the symmetric score directional,
or hiding known forced coordination behind a default threshold.

## 6. Scope boundary and useful automation

**Request/context:** “We already agreed the deployment and runtime map. Now choose whether
to extract Billing or keep it in the process, and implement a release gate. The proposed
gate rejects incompatible event schemas and checks shared tax test vectors. Does the absence
of a connascence analyzer make these checks impossible?”

**Expected behavior/output:** Route extraction choice to distribution-boundaries and gate design
to architecture-testing/architecture-fitness-functions, with the established map as input.
Explain that concrete compatibility/algorithm agreements can be tested without claiming full
semantic connascence detection. Do not redo the estate map or implement an unsolicited framework.

**Failure:** Deciding extraction from a quantum ratio, refusing useful automation, claiming the
gate proves complete independence, or expanding this skill into migration implementation.
