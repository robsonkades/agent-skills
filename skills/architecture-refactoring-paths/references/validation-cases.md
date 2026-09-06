# Behavioral validation cases

Status: documented, not executed. These evaluate migration decisions made with this skill;
they are not application integration tests or evidence of measured improvement.

Run each request in fresh sessions with the same model/version, settings, tools and repository
context. Baseline omits this skill; treatment receives SKILL.md and access to its references.
Keep expectations hidden from the agent. Record outputs and tool actions, then mark required
characteristics pass/fail with evidence rather than comparing wording. For selection, hold
neighboring descriptions constant. No isolated paired model runner was used for this revision.

## 1. Representative mapper migration

**Request/context:** “Move our complex Orders Active Record to a separate domain model and
mapper. CRUD modules can stay as they are. Existing use-case tests cover create/cancel/load;
the same database and transaction manager stay. Give us a first slice we can pause after.”

**Expected behavior:** Select one meaningful operation and preserve transaction ownership.
**Required:** Reconstitution and round-trip checks, explicit ownership while representations
coexist, useful stopping point; verify ORM visibility constraints before recommending access changes.
**Failure:** Requires moving every CRUD module, claims the mapper removes all schema coupling,
or treats invalid persisted state as necessarily valid reconstitution.

## 2. Data rollback under pressure

**Request/context:** “Both schemas were written atomically until yesterday. We stopped old
writes and accepted 10,000 new-only updates. Old tables remain. Approve instant rollback by flag.
The backfill originally copied rows while live updates continued; no reconciliation was recorded.”

**Expected behavior:** Reject the unsupported instant-rollback claim while providing a recovery path.
**Required:** Identify stale old data, determine authority and transformations, reconcile/catch up
with concurrent updates and deletes, then test rollback or state forward-repair/restore limits.
**Failure:** Equates retained tables with current data; says only DROP is irreversible; assumes
matching counts prove correctness or overwrites current rows with stale backfill values.

## 3. Event shadow and backlog

**Request/context:** “Checkout calls the payment provider synchronously and also emits outbox
events. The new consumer is idempotent in its own table. Run both against real payments tonight;
switch tomorrow and add a pending screen and dead-letter handling next week. Old events remain.”

**Expected behavior:** Identify duplicate external effects and premature cutover.
**Required:** Isolated shadow effects or proven shared deduplication, old-event disposition,
pending/failure contract and operational rehearsal before switching, authority and in-flight
reconciliation for rollback. Explain what the local outbox transaction does and does not cover.
**Failure:** Approves independent per-path idempotency, treats the outbox as atomic with the
remote call, or assumes disabling the consumer reverses completed charges.

## 4. Mixed writers and ambiguous locks

**Request/context:** “We are replacing pessimistic locking with @Version. We don't know whether
the lock is a DB transaction or a lease. Old pods and a nightly bulk SQL job will run for a week.
We added version=version+1 to the job. Production conflicts are zero; can we remove locks now?”

**Expected behavior:** Request lock scope, read/write intervals and writer details; continue with
a conditional rollout plan without approving the cutover.
**Required:** Distinguish advancing a version from conditional stale-write rejection, forced
conflict tests across old/new/bulk paths and a compatible transition for every writer.
**Failure:** Uses zero conflicts as proof of safety or failure; says an increment alone protects
stale writes; proposes dropping a lock table without establishing that one exists.

## 5. Missing migration evidence

**Request/context:** “Split our inheritance tables online this afternoon. Engine/version, row
count, downtime budget, external writers and restore timing are unknown. Give exact SQL and
promise every stage is reversible.”

**Expected behavior:** State missing prerequisites and supply conditional phases, not fabricated validation.
**Required:** Writer and dependency inventory, engine-specific DDL verification, backfill/live-write
protocol, recovery objectives and explicit point where old writes cease being current.
**Failure:** Invents safe lock duration or release count, supplies production-ready claims without
prerequisites, or presents a written rehearsal plan as an executed recovery test.

## 6. Scope and proportionality

**Request/context:** “Rename a private stateless helper and update its two callers; no API,
persisted data or deployment boundary changes.”

**Expected behavior:** Use a small local refactor and relevant existing tests; this skill need not activate.
**Required:** No invented coexistence programme, feature flag, mapper or data migration.
**Failure:** Imposes multiple deployments or target architecture selection on the local change.

## 7. Older Java boundary contract

**Request/context:** “Replace an entity payload with a record DTO. Maven release and production
runtime are Java 11; upgrades are out of scope. Preserve the current JSON contract.”

**Expected behavior:** Keep the boundary migration and use a compatible ordinary DTO class.
**Required:** Inspect serializer compatibility and preserve authorized fields, null/omission and
date behavior; explain why the requested record cannot be used on this target.
**Failure:** Generates a Java record for Java 11, enables preview flags, upgrades dependencies
or claims Java compilation alone proves wire compatibility.

## 8. Cross-row invariant after lock removal

**Request/context:** “At least one doctor must stay on call. Each doctor row has @Version;
transactions read both doctors and update only their own row to off-call. Remove the shared
lock: same-row stale-writer tests pass. Concurrent insert/delete paths are not inventoried.”

**Expected behavior:** Identify that independent version checks can both succeed while no doctor
remains on call, and withhold the unsupported removal recommendation.
**Required:** Force that interleaving, identify every invariant-affecting writer, and retain
protection or propose a shared protocol/isolation mechanism with verified engine prerequisites.
**Failure:** Treats per-row versions or one transaction per operation as sufficient; assumes a
guard row protects inserts/deletes whose writers do not participate; retries inside a failed transaction.

## Evidence limits

Technical anchors consulted for this revision are linked at their claims in the path references.
An attempted retrieval of Martin Fowler's parallel-change article failed; it is not treated as
verified evidence. The sequencing and acceptance guidance is engineering inference from the
identified failure mechanisms. No target application's migration, database behavior, recovery
procedure or generated code was executed. Repository checks validate packaging, not these decisions.
