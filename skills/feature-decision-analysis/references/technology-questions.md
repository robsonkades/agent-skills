# Technology questions

## The three questions that settle most of it

Use these as a checklist after the repository sweep. Reuse answers and delegated authority
already in the conversation; ask only unresolved questions that materially change the work,
without requiring a fixed round or a separate technology interview:

1. **Which technologies are mandatory for this feature?**
2. **Which are prohibited?**
3. **Is there an organisational standard I must follow — architecture, API, data, security,
   logging, deployment — that I would not find in this repository?**

Everything below is a prompt for what to check in the sweep first; only what the sweep cannot
settle, and whose answer changes the work, becomes a question.

## Areas where a technology decision hides

| Area                 | Decide, or confirm the existing choice applies              |
| -------------------- | ----------------------------------------------------------- |
| Language and runtime | Version, and whether a newer language feature may be used   |
| Framework            | Version, and whether a new starter or module is acceptable  |
| Libraries            | Licence, supply-chain, runtime, footprint, and removal cost |
| Database             | Which one, and whether this feature may add a schema object |
| Schema change        | Migration tool and the compatibility window                 |
| Messaging            | Broker, topic ownership, delivery guarantee                 |
| Storage              | Files, blobs, retention                                     |
| Cache                | In-process or shared, and invalidation                      |
| Scheduling           | In-process, cluster-wide, or external trigger               |
| API style            | Protocol, versioning, error representation                  |
| Authentication       | How the caller is identified                                |
| Authorisation        | Where the rule is expressed and enforced                    |
| Serialisation        | Format, schema evolution rules                              |
| Configuration        | Where values live, how secrets are supplied                 |
| Observability        | Metric names, log structure, trace propagation              |
| Testing              | Levels, and any new test infrastructure                     |
| Infrastructure       | Anything new to run, and who runs it                        |
| Deployment           | Ordering constraints, flags, rollback                       |

Most rows resolve to “the project already does this, and it applies here.” Record provenance as
PROJECT_EXISTING. Confirmation by the accountable role is warranted only when the authority test
identifies an unresolved commitment beyond existing authorization—not merely because a row
exists or the feature has externally visible behavior. Inspect Java toolchains, resolved
dependencies and runtime images before version-sensitive choices; do not infer upgrade permission.

## Asking without smuggling

The question must not carry its own answer. Compare:

```text
Bad     The project uses Kafka, so I will publish the dispatch event to Kafka.
        (A decision disguised as an observation.)

Bad     Should I use Kafka or something better?
        (Leading, and "better" is undefined.)

Good    The project runs Kafka for shipping events (pom.xml:104, two consumers under
        src/main/java/.../shipping) and has no other broker.

        For this feature, delivery is 4k events/day with a replay requirement.

        - Reuse the existing cluster: no new broker, but topic ownership, ACLs, quotas,
          retention and replay operations must fit the accepted constraints.
        - An outbox table plus a poller: no broker dependency, adds a code path we
          would maintain, replay is ours to build.

        I recommend reuse if retained history, capacity and consumer replay behavior satisfy
        the required replay window; daily volume alone does not decide the design.

        Should this feature reuse Kafka?
```

Ask the example's final question only if reuse is not already authorized. An outbox and Kafka
are not mutually exclusive: atomic database-change/event-intent capture may require an outbox
whose relay publishes to Kafka. The comparison must preserve delivery, replay and failure
requirements; route detailed option evaluation to `feature-solution-analysis`.

## Calibrate a new dependency as a decision

Adding a library commits the project to its licence, transitive tree, release cadence,
vulnerability reports and eventual removal. A small, test-only dependency already permitted by the
project may be an agent-owned implementation choice; a runtime, native, networked, licensed, or
foundational dependency needs its material commitments checked against existing authorization
and applicable review policy. Do not require a new confirmation solely from the dependency category.
Before proposing one:

- Does the project, the framework, or the standard library already do this? Check, with a path.
- What does the project already depend on that is close?
- What is the removal cost if it is abandoned?

Then propose it as a decision with those answers, rather than adding it and mentioning it in the
summary.

## When the project's technology is genuinely wrong for the feature

It happens: the existing broker cannot give the ordering guarantee, the existing cache has no
invalidation the feature can use. Say it plainly, with the evidence, and present it as a choice
between accepting a constraint and adding a mechanism:

> The feature needs per-customer ordering across region changes. The producer keys by region
> (`KafkaConfig.java:38`); a customer's events can therefore move between partitions, and no
> cross-partition sequencing is established. Compare customer-keyed publication with a
> migration plan, a separate topic or explicit sequencing; changing the ordering requirement
> is a separate product decision. Existing authorization determines who can accept the change.

That is the shape: the constraint, its evidence, the options, and why it is being escalated.

If each customer's events always use one stable region/partition, region keying can preserve
their partition order. Still inspect producer ordering/retries and consumer processing;
partition order alone does not prove business-event order or completion order.

## Primary reference

- [Kafka 4.1 design](https://kafka.apache.org/41/design/design/) — partition ordering, consumer positions and retention/compaction semantics. Verify the deployed version and configuration before promising replay or end-to-end ordering.
