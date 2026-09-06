# Boundary and Contract Tests

## Structural rules that test what they name

Start from an agreed dependency direction and import the production classes from every
relevant module. A passing rule over the wrong classpath says nothing. Reflection, generated
wiring, external configuration and remote calls need additional evidence.

The following is a complete JUnit Jupiter test for one example policy. Prerequisites:
compiled production classes under `com.acme`, a domain package, ArchUnit core and JUnit Jupiter
on the test classpath, and a runner that discovers Jupiter tests. The example was written for
ArchUnit 1.5.0 and JUnit 5, with release 17 compilation (runtime validation is recorded in
[validation cases](validation-cases.md)); use the project's compatible versions. Adapt package names and
forbidden dependencies to the accepted architecture; framework-free domains are not universal.

```java
package com.acme.architecture;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ArchitectureTest {
    @Test
    void domain_does_not_depend_on_infrastructure() {
        var production = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.acme");

        assertTrue(production.stream().anyMatch(c ->
                c.getPackageName().equals("com.acme.domain")
                || c.getPackageName().startsWith("com.acme.domain.")),
                "No domain classes imported; check package roots and build outputs");

        noClasses().that().resideInAPackage("..domain..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "..persistence..", "org.springframework..",
                        "jakarta.persistence..", "jakarta.servlet..")
                .because("the domain must not depend on infrastructure")
                .check(production);
    }
}
```

Validate it with a production domain class that depends on a persistence class: expect the
dependency rule, not compilation, to fail. Restore the dependency and expect a pass. Also
exercise a wrong import root so the explicit selection guard fails. Do not globally disable
empty-selection protection.

Other useful rules need equally accurate names:

- A repository suffix restriction is a naming convention. “One repository per aggregate”
  requires an explicit aggregate/port mapping and a check of that mapping, or review.
- A method-only annotation rule misses class-level and composed annotations. State which
  forms it covers and test them; none establishes effective runtime transaction behavior.
- Slice cycle rules depend on the package grouping. A package rename can change what gets
  counted as a module; verify the grouping and a known cycle.
- Entity leakage restrictions apply only where persistence entities are deliberately internal.
  Intentional entity/domain mapping is a different policy, not a test failure to hide.

Exempt specific members/classes with a reason and owner, without exempting future classes
through a broad package wildcard. A build-enforced boundary still needs discovery and
coverage checks.

Source: [ArchUnit guide](https://www.archunit.org/userguide/html/000_Index.html),
checked 2026-09-05 (1.5.0): bytecode import, rule execution and empty-selection behavior.

## Web boundaries

Use a web slice when the claim is binding, validation, status or serialized fields. Load
the actual relevant exception advice, validators, converters and filters. Spring Boot slice
and mocking annotations vary by version; inspect the project's dependencies before copying
configuration. A mock application service is appropriate for isolating HTTP translation, not
for proving transaction behavior.

For each request, make unrelated preconditions valid. An invalid UUID, missing authentication
or missing CSRF token can make a “reject empty lines” test pass without reaching line validation.
Assert the intended field/error code and that the use case was not invoked. For error translation,
supply valid input and deliberately trigger the expected domain outcome.

Test public payloads from actual serialization. Check sensitive fields are absent as keys,
including null-valued fields and nested objects where relevant. A strict field allowlist can
protect confidential data but should reflect the policy for benign additions. Do not ban a
version field if the API uses it for concurrency control. Include authorization/tenant boundary
cases when those are part of the promise; a service mock does not validate service-side access.

Avoid ambiguous example JSON: use a normal escaped Java string or a text block whose opening
delimiter is followed by a newline. Project-specific error shapes and fixture helpers must be
identified as such, not presented as framework defaults.

A mapper's unmapped-target compiler check catches omissions, not swapped same-type fields,
rounding, conversions or intentional omission of secrets. Keep tests for those semantics.
Likewise, verifying that this controller applies validation tests your wiring, not Spring's
generic validation implementation.

## Gateways

Exercise the real adapter and configured HTTP client against a controlled local server.
Start and close the server explicitly, inject its URL, prohibit accidental external calls,
and verify outbound method/path/headers/body. Choose the stub API matching the installed
WireMock/MockWebServer version rather than assuming examples are interchangeable.

Cover the failure classes in the gateway contract: connect failure, delayed headers/body,
non-success status, malformed content and abrupt disconnect where relevant. Verify domain
translation at the public adapter boundary; either an exception or a result type may be correct.
Also count attempts if retries are configured.

Use a delay long enough to exceed the client's configured timeout and a separate bounded test
watchdog. Verify the actual failure classification and request count, not just “finished within
five seconds.” Preemptive test timeouts run work on another thread and can invalidate thread-bound
transaction assumptions. Client timeouts and explicit shutdown are still required: interrupting
a test is not guaranteed to stop a socket operation or undo a side effect.

A stub verifies the adapter against the behavior you modeled; it does not certify the vendor's
live protocol. Link the fixture to published examples/contracts and use controlled provider
verification or sandbox checks where required. Never require live third-party calls in an
otherwise isolated test.

## Contracts: artifact, implementation and version pair

Consumer-driven testing should exercise the actual consumer client against the contract mock.
Provider verification replays those interactions against the actual provider endpoint with
controlled provider states. Record consumer/provider versions, contract identity and verification
result; CI must use the combinations eligible for deployment, not only whichever contract is newest.

A schema diff is a different check. Declare direction (old consumer/new provider or the reverse),
schema format and compatibility policy. Test that the implementation actually conforms to the
schema as well as comparing artifacts. OpenAPI/Protobuf/Avro checkers cover different changes;
do not treat them as interchangeable or a schema diff as end-to-end behavioral proof.

Additions may break closed readers, enums or stricter validation. Semantics such as money units,
ordering and idempotency can change without a schema change. Test the promised semantics through
representative consumer behavior. For events, exercise producer serialization and consumer
handling, including relevant old versions and absent/unknown fields.

Source: [Pact's model](https://docs.pact.io/getting_started/how_pact_works), checked 2026-09-05.
Pact is one implementation of consumer/provider verification; schema-only checks are not equivalent.
Contract policy belongs to `rpc-and-api-contracts`, payload design to `remote-facade-and-dto`.
