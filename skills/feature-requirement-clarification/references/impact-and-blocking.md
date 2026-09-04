# Impact and blocking

Two independent axes. Impact says how much the answer changes. Blocking says whether work can
continue without it. A question can be HIGH impact and non-blocking, if the work it changes is
not the work about to start.

## Impact

| Impact     | The two answers differ in                                                      |
| ---------- | ------------------------------------------------------------------------------ |
| **HIGH**   | The contract, the execution model, what is persisted, or the failure behaviour |
| **MEDIUM** | Which components exist, their internals, or the order of work                  |
| **LOW**    | Naming, formatting, or nothing at all                                          |

Read the table as a test, not a vibe. If you cannot name the thing that differs, the impact is
LOW and the question does not get asked.

## Blocking

A question is BLOCKING when **any** of these holds:

- The next resource to be implemented depends on the answer.
- Both answers require work that would have to be undone if the other were chosen.
- The answer decides a contract that other people or systems will start depending on.
- The answer is a security, privacy, compliance or data-retention obligation.
- Proceeding on the wrong answer would write or migrate data.

A question is NOT blocking when the work it affects is later in the execution order and the
answer can arrive before that point. Say so explicitly: "non-blocking until RES-07".

## Worked examples

```text
Q  Should processing be synchronous or asynchronous?
   Impact: HIGH — changes the API contract, the execution model, what is
           persisted, and how failure is reported.
   Status: BLOCKING — the first resource is the endpoint, whose signature differs.

Q  Should the job history be retained for 30 days or indefinitely?
   Impact: HIGH — decides whether a retention job and an index exist.
   Status: NON-BLOCKING until RES-06. The table and the writes are identical either way.

Q  Should the new endpoint be under /api/v1 or /api/v2?
   Impact: MEDIUM — no behaviour differs; the versioning policy does.
   Status: NON-BLOCKING. The repository shows every endpoint under /api/v1; proceed
           there and record it as an assumption.

Q  Should we use Lombok for the new DTOs?
   Impact: LOW — the project already uses records for DTOs throughout.
   Status: Not asked. Follow the established pattern and say that you did.
```

## Handling a blocking question

1. Stop the phase. Do not start implementation on a placeholder.
2. Write the question with both consequences.
3. Say what continues meanwhile — usually the non-dependent resources — and what does not.
4. Record it in the progress artefact as a blocker with the decision it needs, so the state
   survives the end of the session.

An answer that arrives partially — "probably async, but check with the platform team" — is not
an answer. Record it as still blocking, with the owner named.

## Handling an unanswerable question

Sometimes nobody knows. Then:

- Identify the accountable role and the phase/resource that cannot proceed.
- Prefer the reversible option only for work inside explicitly delegated authority.
- Otherwise keep it blocked, or create a `GAP-*` with consequence, authorized owner, expiry, reopening
  trigger and affected work.
- Record any temporary choice as an assumption with a falsifier and an `ED-*` with provenance; contain
  it so reversal touches one place.
