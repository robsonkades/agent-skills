# Technology questions

## The three questions that settle most of it

Asked once, in round 2, after the repository sweep so that they are confirmations rather than
interrogations:

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
identifies external behaviour, material cost, policy, data, or expensive reversibility—not merely
because a row exists.

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

        - Reuse the existing cluster: nothing new to operate, topic ownership to agree.
        - An outbox table plus a poller: no broker dependency, adds a code path we
          would maintain, replay is ours to build.

        I recommend reusing the cluster, because the replay requirement is satisfied
        natively and the volume does not justify a second mechanism.

        Should this feature reuse Kafka?
```

The good version does three things: it separates observation from proposal, it gives the user
the two facts that actually decide it, and it asks one closed question.

## Calibrate a new dependency as a decision

Adding a library commits the project to its licence, transitive tree, release cadence,
vulnerability reports and eventual removal. A small, test-only dependency already permitted by the
project may be an agent-owned implementation choice; a runtime, native, networked, licensed, or
foundational dependency normally earns explicit review by the accountable engineering/operations
roles. Before proposing one:

- Does the project, the framework, or the standard library already do this? Check, with a path.
- What does the project already depend on that is close?
- What is the removal cost if it is abandoned?

Then propose it as a decision with those answers, rather than adding it and mentioning it in the
summary.

## When the project's technology is genuinely wrong for the feature

It happens: the existing broker cannot give the ordering guarantee, the existing cache has no
invalidation the feature can use. Say it plainly, with the evidence, and present it as a choice
between accepting a constraint and adding a mechanism:

> The feature needs per-customer ordering. The existing topic is partitioned by region
> (`KafkaConfig.java:38`), so ordering per customer is not guaranteed today. Options: repartition
> the topic, which affects the two existing consumers; add a topic; or relax the requirement to
> per-region ordering. This is a decision I should not take alone — it changes an existing
> contract.

That is the shape: the constraint, its evidence, the options, and why it is being escalated.
