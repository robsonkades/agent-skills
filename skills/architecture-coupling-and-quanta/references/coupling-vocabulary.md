# Coupling vocabulary and map interpretation

## Separate the questions

A deployment target is something operations can address for deployment and rollback.
A coordinated release group is a set of targets whose versions must move together for
a specified change. A workflow dependency is something needed for a stated outcome at
runtime. A service name, repository, team or pipeline is not automatically any of these.

Static dependencies include runtime prerequisites such as data and platform capabilities,
not only imports. Dynamic coupling describes runtime interaction, not “coupling that changes.”
The same pair can have both: a shared generated contract and a mandatory synchronous call.

A compatible interface limits the changes consumers must track; it does not abolish all
coupling. Record direction: a provider removing a field may force a consumer change, while
a consumer changing its internal algorithm need not force the provider to change.

## Using “quantum” without hiding assumptions

The definition in Ford, Richards, Sadalage and Dehghani's _Software Architecture: The Hard
Parts_ (2021), chapter 2, combines deployability, cohesion, static coupling and synchronous
dynamic coupling. The accessible preview distinguishes operational dependencies from
communication dependencies within a workflow. See the primary-source record in
[evidence-and-disagreements.md](evidence-and-disagreements.md).

The following mapping convention is this skill's analytical method, not a quotation or a
claim that the book prescribes a connected-component algorithm:

1. Draw targets and their structural dependencies, including data ownership and shared runtime
   prerequisites. Mark actual lockstep changes, compatible version coexistence and rollout order.
2. Describe the business responsibility of each candidate group. Strong coupling is not evidence
   of good cohesion: an accidentally entangled group may span unrelated responsibilities.
3. Overlay the runtime dependency paths for each relevant workflow and failure condition.
   Preserve alternative and quorum groups rather than treating every drawn edge as individually
   mandatory. Dependencies can overlap across workflows; do not force all paths into one estate partition.
4. If a single quantum count is requested, first agree the boundary convention. Report candidate
   groups with assumptions; distinguish a conservative union of coupling edges from independently
   releasable groups. Keep both views when they answer different questions.

A monolith deployed as one unit has one deployment boundary; that says nothing about how
well its internal modules are separated. Shared infrastructure belongs on the map even
when excluded from application grouping. State whether excluding it means compatible platform
use, separate tenancy, or merely “outside the scope”; exclusion does not remove outage risk.

### Worked boundary decisions

| Evidence supplied                                                                                          | Supported finding                                                                                                           | Evidence that could change it                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A and B pin different compatible versions of a library and mixed-version tests pass                        | Both depend on the library; no demonstrated lockstep consumer release for those changes                                     | A mandatory incompatible protocol/security migration                                   |
| Checkout waits on Pricing for a quote; both deploy independently under tested API compatibility            | Runtime quote path includes both; release targets remain distinct                                                           | A contract change requiring an atomic rollout, or valid tested quote fallback          |
| A producer returns accepted after durable enqueue; fulfillment is required within ten minutes              | Acceptance can tolerate consumer downtime within storage limits; fulfillment remains dependent on the consumer and recovery | Queue exhaustion, retention expiry or a stricter completion requirement                |
| Two apps connect to one database instance, with unknown table access                                       | Shared platform exposure is observed; data/change coupling is unknown                                                       | Grants, migrations and representative object-level reads/writes                        |
| A new server must deploy before a client, but supports old clients and either client version can roll back | Directional rollout constraint, not necessarily simultaneous release                                                        | Evidence old/new versions cannot coexist or rollback crosses an irreversible migration |

## Connascence as a review vocabulary

Use a form only when it identifies a concrete agreement and a possible failure. The common
taxonomy names static forms Name, Type, Meaning/Convention, Position and Algorithm, and
dynamic forms Execution, Timing, Value and Identity. “Static” here does not mean harmless;
“dynamic” does not mean invisible to source inspection.

Useful architecture-scale examples:

- **Name/type/position:** peers agree on field names, types or tuple positions. Versioned
  contracts and compatibility tests can make that agreement explicit.
- **Meaning:** both peers interpret status 3 as “partially refunded,” but the contract does not
  state it. A syntactically compatible change can still break the business meaning.
- **Algorithm:** two services must compute the same tax or signature result. Verify algorithm
  versions, rounding, inputs and shared test vectors rather than assuming duplicate code agrees.
- **Execution/timing:** a consumer assumes a prior event arrived, or two actions must happen
  within a window. Test reordering, delays and recovery, even with asynchronous transport.
- **Value/identity:** peers must preserve a cross-value invariant or refer to the same entity.
  State the invariant or identity scheme; do not equate remote entity IDs with shared in-memory
  object identity without explaining the analogy.

The useful judgment is scope, number of affected parties and difficulty of discovering or
changing the agreement. A fixed strength ranking is not a measured risk scale. Prefer making
a hidden cross-boundary agreement explicit or assigning it one owner over merely renaming
its connascence form. Specific agreement violations can be tested; complete semantic discovery
still needs human review.

The taxonomy is used here as practitioner vocabulary, not as a validated predictive metric.
The original Page-Jones paper was not directly consulted and Weirich's slide retrieval failed; do not
attribute exact quotations or a universal ordering to them. The community reference
[connascence.io](https://connascence.io/) can supply terminology, not evidence of defect reduction.
