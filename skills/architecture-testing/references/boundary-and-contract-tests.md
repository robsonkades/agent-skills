# Boundary and Contract Tests

## Architecture tests: rules that execute

A boundary described in a document decays. A boundary asserted by a failing build does not.

```java
@AnalyzeClasses(packages = "com.acme", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule domain_has_no_framework =
        noClasses().that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAnyPackage(
                "org.springframework..", "jakarta.persistence..",
                "com.fasterxml.jackson..", "jakarta.servlet..");

    @ArchTest
    static final ArchRule no_entities_outside_persistence =
        noClasses().that().resideOutsideOfPackages("..persistence..")
            .should().dependOnClassesThat().areAnnotatedWith(Entity.class);

    @ArchTest
    static final ArchRule transactions_only_in_application =
        methods().that().areAnnotatedWith(Transactional.class)
            .should().beDeclaredInClassesThat().resideInAPackage("..app..");

    @ArchTest
    static final ArchRule one_repository_per_aggregate =
        classes().that().haveSimpleNameEndingWith("Repository")
            .should().haveSimpleNameNotEndingWith("EntityRepository");   // project convention

    @ArchTest
    static final ArchRule modules_are_acyclic =
        slices().matching("com.acme.(*)..").should().beFreeOfCycles();

    @ArchTest
    static final ArchRule no_field_injection =
        noFields().should().beAnnotatedWith(Autowired.class);
}
```

Two practices that keep these useful rather than annoying:

- **Exemptions name the class and the reason**, in the rule, rather than widening the
  pattern. A widened pattern silently exempts everything added later.
- **Add a rule when a violation is found in review**, not speculatively. Rules that encode
  taste rather than a boundary get disabled during the first deadline.

## Web boundary tests

The web layer's responsibilities are binding, validation, status codes and response shape.
Test exactly those, with the application mocked:

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean PlaceOrder placeOrder;      // Spring Framework 6.2+
    @MockitoBean OrderQueries queries;

    @Test
    void rejects_a_request_with_no_lines() throws Exception {
        mvc.perform(post("/orders").contentType(APPLICATION_JSON)
                .content("""{"customerId":"...","lines":[]}"""))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.title").value("Validation failed"))
            .andExpect(jsonPath("$.errors[0].field").value("lines"));
        verifyNoInteractions(placeOrder);
    }

    @Test
    void maps_a_domain_conflict_to_409() throws Exception {
        when(placeOrder.place(any())).thenThrow(new OrderAlreadyPlaced(orderId));
        mvc.perform(post("/orders").contentType(APPLICATION_JSON).content(validBody()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ORDER_ALREADY_PLACED"));
    }

    @Test
    void response_exposes_only_the_agreed_fields() throws Exception {
        when(queries.detail(any())).thenReturn(Optional.of(aDetailView()));
        mvc.perform(get("/orders/{id}", id))
            .andExpect(jsonPath("$.total.currency").value("BRL"))
            .andExpect(jsonPath("$.customerInternalScore").doesNotExist())   // ← the guard
            .andExpect(jsonPath("$.version").doesNotExist());
    }
}
```

The negative assertion in the third test is the one that pays. Accidental exposure happens
when a field is added to a view type, and nothing else notices
(`remote-facade-and-dto`).

## Gateway tests, including the failures

```java
class HttpCreditBureauTest {

    static MockWebServer server;                      // or WireMock
    CreditBureau bureau;

    @Test
    void translates_a_decline() throws Exception {
        server.enqueue(new MockResponse()
            .setBody("""{"decision":"DECLINE","code":"NO_HISTORY"}""")
            .addHeader("Content-Type", "application/json"));

        assertThat(bureau.assess(taxId, limit))
            .isEqualTo(new Declined(DeclineReason.NO_HISTORY));
    }

    @Test
    void a_server_error_becomes_unavailable_not_an_exception() {
        server.enqueue(new MockResponse().setResponseCode(503));
        assertThat(bureau.assess(taxId, limit)).isInstanceOf(Unavailable.class);
    }

    @Test
    void a_hang_is_bounded_by_the_read_timeout() {
        server.enqueue(new MockResponse().setBodyDelay(30, SECONDS));
        assertTimeoutPreemptively(Duration.ofSeconds(5),
            () -> assertThat(bureau.assess(taxId, limit)).isInstanceOf(Unavailable.class));
    }

    @Test
    void a_malformed_payload_does_not_leak_a_parse_exception() {
        server.enqueue(new MockResponse().setBody("<html>maintenance</html>"));
        assertThatThrownBy(() -> bureau.assess(taxId, limit))
            .isInstanceOf(UnexpectedBureauResponse.class);          // not JsonParseException
    }
}
```

The last three tests are the reason to write gateway tests at all. The happy path rarely
breaks; the timeout, the 503 and the maintenance page are what production delivers, and they
are where a gateway either contains the vendor or leaks it
(`enterprise-base-patterns`).

## Contract tests

The point is that **both sides verify independently**, so neither has to run the other.

```text
Consumer side   states its expectation → produces a contract artefact
Provider side   replays the contract against the real implementation
CI              provider's build fails when it breaks a consumer's expectation
```

With a schema-first contract (OpenAPI, Protobuf, Avro), the equivalent is:

```java
@Test
void the_api_still_matches_the_published_schema() {
    var actual = openApiFromRunningApplication();
    var published = readResource("openapi/orders-v1.yaml");
    assertThat(breakingChanges(published, actual))
        .as("removals and type changes break consumers")
        .isEmpty();      // additions are permitted
}
```

Compatibility depends on the contract technology and consumer behavior. Additive fields are often
backward-compatible for tolerant JSON readers, but closed schemas, generated clients, enums,
validation constraints and event consumers can make an addition breaking. Configure the checker
for the actual compatibility policy (`rpc-and-api-contracts`).

For events, the same discipline applies and is more often missing: a published event's shape
is a contract with every consumer, and a renamed field in an event payload is a silent break
that appears as a consumer that stopped acting (`distribution-boundaries`).

## What not to test at this level

- **Framework behaviour.** That `@Valid` triggers validation is the framework's test.
- **Getter/setter round trips.** Zero information.
- **A mapper's every field, by hand.** Configure the generator to fail on unmapped targets
  and delete the test (`metadata-mapping`).
- **The presence of an annotation.** `@Transactional` being present does not mean a
  transaction started; assert the rollback outcome instead
  (`persistence-and-concurrency-tests.md`).
