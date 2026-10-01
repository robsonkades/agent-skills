# Verify the claimed boundary

Read when implementing a slice or assessing whether its evidence can support a claim.
Use the project's harness; the [fixture](../assets/boundary-fixture/README.md) is a
small teaching example, not acceptance coverage for a service being delivered.

| Claim                                            | Required observation                                                                                           | False reassurance to reject                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Domain invariant survives alternate callers      | Plain tests construct/invoke the domain and reject invalid state                                               | Bean Validation tested only on HTTP                                                  |
| Application owns authorization and orchestration | Pure use-case test denies an actor with no writes and produces the expected permitted result                   | Controller-only authorization or verifying method order without state/outcome        |
| Inner source dependencies follow the decision    | Selected production classes/signatures satisfy the boundary rule                                               | Matching folder names, zero classes or imports checked only in tests                 |
| Rule detects prohibited dependencies             | A compiled isolated violation fails the same rule for the expected type                                        | Compiler failure or setup failure presented as an architecture failure               |
| Spring entry preserves atomicity                 | Real wired entry commits both writes; second failure leaves the first absent, observed outside the transaction | An outer test transaction rolls everything back irrespective of application behavior |
| Presentation change stays outside                | Different representation with same inner outcome and unchanged public compatibility where promised             | Result record compiles but actual consumer contract is untested                      |

Use build/module restrictions or bytecode rules suitable for the agreed policy. The
fixture permits the domain to depend only on `java.lang`, `java.util` and itself; the
application additionally sees the domain. This narrow allowlist is specific to the
example, not a ban on suitable JDK value APIs such as `java.time` or all third-party
value libraries in every core. Test source selection is excluded; assert each intended
production region is nonempty and that representative expected classes are imported.
For multiple modules, import and assert coverage of every relevant artifact.

[ArchUnit's user guide](https://www.archunit.org/userguide/html/000_Index.html) documents
bytecode import, dependency rules and empty-rule protection. Preserve empty checks and
prove sensitivity. A reflection string, runtime bean selection or database contract can
escape a source dependency rule; retain runtime integration tests for those mechanisms.

The asset compiles a forbidden Spring type into a temporary production-style source
root and runs the same application rule against its bytecode. Its negative test
asserts the named violation. It also checks an inner-to-outer fixture reference and
empty selection. No generated violation is written under the distributed package.

Observe database state after the real method returns, using a separate operation and
no test-managed transaction. Include a failure after the first actual write; test that
the preexisting fixture state survives while the new first write is absent. A passing
H2 result supports this local wiring example only. For claims about PostgreSQL/MySQL,
isolation, concurrency, migrations or driver errors, use the actual production-family
engine/configuration and relevant failure scenario. A fake ledger verifies decisions,
not SQL or rollback.

When callers can already own a transaction, add a separate composition check: invoke
the real entry inside a caller transaction, observe its result, deliberately roll the
caller back, then inspect state after that outer boundary completes. This distinguishes
a returned outcome from committed success under
[required propagation](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/transaction/TransactionDefinition.html#PROPAGATION_REQUIRED).
The fixture includes this case alongside its standalone commit/rollback tests; it does
not replace them with a test-managed transaction that could hide a missing wrapper.

For an implemented HTTP path, test real serialization, status/error mapping and the
relevant filter/security path as well. The bundled example has no HTTP listener or
authentication mechanism. Its trusted-actor test establishes only application-level
access enforcement. Do not report it as end-to-end API security.

Record the exact command, JDK/Boot/dependency versions, tests actually discovered and
counts/results. Separate code execution, package validation and agent behavioral
evaluation. When a required environment is unavailable, report the unmet assertion
and remaining useful checks; do not relabel skipped tests as passes.
