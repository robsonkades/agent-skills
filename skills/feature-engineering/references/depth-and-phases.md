# Depth and phases

## Classifying

Ask the five questions in order. The first `yes` fixes the class.

1. Does the change introduce a technology, dependency or infrastructure component the project
   does not already run? → **Significant**
2. Does it break an existing contract — API shape, message schema, database column, public
   method others call — or require a data migration? → **Significant**
3. Will the work outlive this session, or be handed to someone else? → **Significant**
4. Does it touch more than one module, or a contract that is internal but shared? → **Standard**
5. Otherwise → **Direct**

Two amendments that override the ladder:

- **The user asked for the analysis.** A request to "plan this properly" is Significant
  regardless of size. The user owns that call.
- **A regulated concern is in play** — authentication, authorisation, personal data, payment,
  audit. Minimum **Standard**, because the questions in those areas are the ones that cannot be
  answered from the repository alone.

## Which phases each class runs

| Phase                           | Direct                   | Standard                             | Significant                             |
| ------------------------------- | ------------------------ | ------------------------------------ | --------------------------------------- |
| Discovery                       | inline, unwritten        | written                              | written                                 |
| Requirement clarification       | only if something blocks | yes                                  | yes                                     |
| Context analysis                | read the touched files   | yes                                  | yes                                     |
| Scope analysis                  | one sentence             | yes                                  | yes                                     |
| Architecture impact             | no                       | impact map                           | impact map                              |
| Solution analysis               | no                       | only where a real choice exists      | yes                                     |
| Decision analysis and records   | no                       | for choices that survive the feature | yes                                     |
| Decomposition                   | no                       | resources only                       | stories and resources when they earn it |
| Risk analysis                   | no                       | risks above LOW only                 | yes                                     |
| Implementation plan             | no                       | short plan                           | full plan                               |
| Readiness gate                  | no                       | yes                                  | yes                                     |
| Execution and progress tracking | ordinary implementation  | tracked resources                    | tracked resources                       |
| Completion review               | verify and report        | yes                                  | yes                                     |

"Inline, unwritten" means the thinking still happens — the separation of fact from assumption
still governs what you may claim — but it produces no file.

## Escalation

Escalate the moment any of these appears, whatever the original class:

- A question surfaces that the repository cannot answer and whose answer changes the design.
- The touched-file list grows past what the class assumed.
- An existing test has to be changed to accommodate the feature.
- A second technology becomes necessary to make the first one work.

Escalating means: run the phases the new class requires, from where you are. It does not mean
restarting. Say in the report that the class changed and what changed it.

## De-escalation

De-escalate only when a question that drove the classification comes back answered in a way
that removes the work — for example, a proposed new dependency turns out to be already present
and already used for this purpose. Record the answer, then drop the phases it retires.
