# Ledger format

## Entry shapes

Illustrative entries, not claims about this repository. Replace sources with evidence from
the actual feature and use its existing identifier convention. Missing approval stays missing.

```text
FACT   F-01  At revision abc123, the controller returns the created resource inline.
             Source: src/main/java/com/acme/order/OrderController.java:41 at abc123.
             Scope: code path inspected; production behaviour not observed.

FACT   F-02  The user asked for "asynchronous processing", naming no technology.
             Source: request message, 2026-09-02

ASSM   A-01  "Asynchronous" means the caller receives an acknowledgement and the work
             may complete after the initial response.
             Basis: provisional reading of the request, not an accepted contract.
             Falsified by: the required response must wait for completed processing.

UNK    U-01  Whether the caller needs to observe completion, and how.
             Impact: HIGH — decides whether a callback, a status endpoint or nothing
             at all is part of the contract.

DEC    ED-01 Records live in docs/features/async-order-processing/.
             Owner: engineering; proposed by agent (no existing convention found under docs/).
             Status: proposed. Source: agent proposal; accountable-owner acceptance pending.
```

Identifiers are stable for the life of the feature. Later phases cite them — a plan that says
"RES-03 exists because of U-01" is auditable; one that repeats the prose is not.
An unresolved unknown explains risk, not authorization to implement a chosen answer. Link
downstream work to the accepted resolution as well. Polling is compatible with asynchronous
processing and does not itself falsify A-01.

## Impact, defined by consequence

| Impact     | Test                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| **HIGH**   | Plausible answers materially change scope, acceptance, contracts, security, data, failure behaviour or architecture |
| **MEDIUM** | Plausible answers change bounded internal work, sequencing or operational details without a high-impact consequence |
| **LOW**    | Plausible answers do not materially change delivery, acceptance or operation                                        |

Impact describes the consequence of getting the answer wrong, not its probability or how
much code changes. A one-line authorization rule can be HIGH. When consequences are not yet
established, state a provisional classification and the missing basis rather than inventing
two equally likely answers. Clarification owns prioritization and gap handling.

## Resolving an entry

Append; never overwrite:

```text
UNK    U-01  Whether the caller needs to observe completion, and how.
             Impact: HIGH
             RESOLVED 2026-09-03 -> FACT F-09: a status endpoint is required.
             Source: Product owner answer, round 1, accepted definition revision PD-02.
             Authority: established Product owner for this behaviour.
```

The resolution says where the answer came from. Three sources are not interchangeable: **the
repository** (evidence), **a participant** (intent plus their established authority), and **the
agent** (a proposal that still needs the accountable role when consequential). Use supplied
evidence of scope, authority and supersession to incorporate an established resolution;
conversational recency alone does not establish one.

When sources remain incompatible, facts about what each source says can coexist; their
mutually exclusive claims about the system cannot both be established for the same scope.
Keep the effective value or requirement as UNKNOWN with links to both sources and the
consequence of choosing incorrectly. Mark an affected prior claim as disputed while retaining
its history, and identify downstream entries that relied on it as needing revalidation.
Hand off the unresolved conflict to context or clarification instead of silently picking a
source, replacing the old claim, or reopening a resolution already supported by the input.

## Two failure shapes to check the ledger against

**The confident ledger.** Check whether each fact is supported by its cited source and
whether that source establishes code, observed behaviour or stated intent. A request or
decision need not be printable by a command. Do not invent unknowns simply because a short,
well-evidenced request has none.

**The exhaustive ledger.** Forty unknowns, all MEDIUM. Impact was assigned by how uncertain the
answer feels rather than by what it changes. Re-derive consequences and merge duplicates;
neither count nor uniform classification alone proves the ledger wrong.

## What does not belong here

- Options and trade-offs — the solution phase owns those.
- Task lists — decomposition owns those.
- Newly selected implementation designs. Existing design constraints and recorded decisions
  may belong as sourced facts/decisions; discovery does not choose new ones.
