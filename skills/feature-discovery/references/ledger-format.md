# Ledger format

## Entry shapes

```text
FACT   F-01  The order API is synchronous and returns the created resource.
             Source: src/main/java/com/acme/order/OrderController.java:41

FACT   F-02  The user asked for "asynchronous processing", naming no technology.
             Source: request message, 2026-09-02

ASSM   A-01  "Asynchronous" means the caller receives an acknowledgement and the work
             completes later, rather than the caller polling.
             Falsified by: the user describing a polling or streaming interface.

UNK    U-01  Whether the caller needs to observe completion, and how.
             Impact: HIGH — decides whether a callback, a status endpoint or nothing
             at all is part of the contract.

DEC    D-01  Records live in docs/features/async-order-processing/.
             Made by: agent (no existing convention found under docs/).
```

Identifiers are stable for the life of the feature. Later phases cite them — a plan that says
"resource R03 exists because of U-01" is auditable; one that repeats the prose is not.

## Impact, defined by consequence

| Impact     | Test                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- |
| **HIGH**   | The two answers produce different contracts, storage, failure behaviour or components |
| **MEDIUM** | The two answers produce the same components, different internals or ordering          |
| **LOW**    | The two answers produce the same implementation                                       |

Impact is about the design, not about business importance. A question that matters enormously
to the business but has one plausible answer is not HIGH.

## Resolving an entry

Append; never overwrite:

```text
UNK    U-01  Whether the caller needs to observe completion, and how.
             Impact: HIGH
             RESOLVED 2026-09-03 -> FACT F-09: a status endpoint is required.
             Source: user answer, round 1.
```

The resolution says where the answer came from. Three sources, and they are not
interchangeable: **the repository** (evidence), **the user** (authority), **the agent**
(a proposal that was accepted). A later disagreement is settled by which of the three it was.

## Two failure shapes to check the ledger against

**The confident ledger.** Many facts, no assumptions, no unknowns. Almost always means
assumptions were written in the fact column. Re-read every fact and ask what command would
print it; the ones with no answer are assumptions.

**The exhaustive ledger.** Forty unknowns, all MEDIUM. Impact was assigned by how uncertain the
answer feels rather than by what the answer changes. Re-derive each one from the consequence
table above; most collapse to LOW.

## What does not belong here

- Options and trade-offs — the solution phase owns those.
- Task lists — decomposition owns those.
- Anything about how the feature will be built. The ledger is about what is true, what is
  guessed and what is missing; once it starts describing a design it stops being usable as a
  check on that design.
