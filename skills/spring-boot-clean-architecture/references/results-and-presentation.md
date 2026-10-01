# Results, output boundaries and presentation

Read when a use case returns transport types, when multiple consumers need different
representations, or when a proposed presenter adds state or callbacks to a simple flow.

## Choose by the interaction

For a synchronous operation with one final outcome, return an application-owned immutable
result. Its fields express facts such as order identity and accepted total; the HTTP
adapter chooses status, headers and JSON field names. A CLI or view can map the same
facts differently. This preserves inward dependencies without an input interface,
output interface and presenter being obligatory for each concrete operation.

Check ownership as well as the type name: a Java
[record is only shallowly immutable](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Record.html).
For collection or array results, take an owned snapshot and prevent consumers from
mutating its contents through shared elements or accessors. `List.copyOf` is suitable
for immutable elements when nulls are forbidden; it does not copy the elements and
[rejects null elements](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html).
Preserve an existing null/absence contract when selecting the copy strategy. Verify
that changing the source collection or a returned mutable value cannot change the
promised snapshot. The fixture's string/primitive result needs no defensive copying.

When the application must drive a defined interaction, such as distinct progress and
completion outputs in an existing workflow, an inner-owned output interface can be
appropriate. Define which outcomes can occur, ordering, cardinality, cancellation and
whether completion means committed state. An outer presenter implements that contract
and builds the view. Do not pass an HTTP writer, `ResponseEntity`, JPA object or mutable
view model into the inner interface. The use case depends on the contract it owns.
This placement follows Martin's
[presenter boundary example](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html);
choosing a returned result for the simpler case is this skill's proportional design
judgment, not a claim that his example mandates or forbids it.

| Evidence                                                      | Suitable initial choice                                           | Reason to change                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| One final immutable result; ordinary HTTP consumer            | Direct result and adapter mapping                                 | The interaction itself develops an application-owned output protocol                   |
| Same result in HTML, JSON and a batch summary                 | Separate outer mappers/presenters consuming the result            | Formatting differences alone do not need callbacks or three application DTO copies     |
| Existing workflow requires application-selected output events | Inner output contract with outer implementations                  | A simple final result proves sufficient; remove unnecessary callback lifecycle         |
| Existing caller owns response streaming                       | Inspect cancellation, partial failure and commit visibility first | Do not force a synchronous result or hold a DB transaction while waiting on the client |

A presenter that simply forwards every field can be a plain mapper function. Prefer a
stateless mapper when it fits. If a presenter accumulates per-invocation state, create
or scope it per invocation; a mutable singleton can expose one user's output to another.
Do not move an external protocol's policy into the core by calling it an output port.

When following the catalog DDD reference, `infrastructure.category.presenters.CategoryApiPresenter`
uses static `present(CategoryOutput)` and `present(CategoryListOutput)` methods to map
application outputs into HTTP response models. `CategoryController` calls the mapper
after `GetCategoryByIdUseCase.execute`, or maps a returned page with its method reference.
Preserve this outer result mapping; the `Presenter` suffix does not establish an inner
callback protocol. Read [DDD reference alignment](ddd-reference-alignment.md) for the
source locations and operation-specific result conventions.

## Success visibility and compatibility

An output emitted inside a transaction may be observed before commit, which can still
fail. Return only after the effective transaction completes when the contract promises
committed success. A `REQUIRED` boundary can join a caller's transaction: returning
from its method/template does not then mean the outer transaction committed. Identify
who owns the effective completion. If callbacks are required, distinguish provisional
output from committed completion and emit the latter after confirmed effective commit,
outside the transaction body. Do not assume presenter invocation means persistence
succeeded. A local event or
after-commit callback is not itself durable external delivery.

Preserve existing failure/status distinctions at the adapter. Domain validation,
forbidden access, absence, conflict and unexpected infrastructure failure need the
appropriate public mapping. Exposing raw exception messages can disclose storage or
identity details. HTTP error contract details belong to `spring-boot-web`.

For a migration, lock the accepted public request/response examples and failure cases,
then change the mapping behind them. Test a representation change independently of
the use case. The shipped `ReceiptViews` demonstrates two outer representations of
the same inner result; its test asserts the preserved inner values and changed view.
It is an ordinary result mapping example, not an executable callback presenter or
proof of HTTP compatibility.
