# Slice configuration and replacements

Start with the assertion's dependency path. For an MVC request, list controller,
binding/validation, advice, serialization, filter chain, and the first service boundary.
Inspect which of those are real in the test. Boot's slice discovery is selective;
finding a controller does not establish that its application's configuration was loaded.

| Symptom                                                  | Evidence and focused correction                                                                                                                                                                         | Check that can reject the diagnosis                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Slice returns a different error body                     | Inspect advice/converter imports and resolved configuration; import the actual component that owns the contract.                                                                                        | Invalid request reaches the real advice and checks its public body.                                                              |
| Allowed request passes, denied request also passes       | Check `addFilters`, actual chain beans, request matchers and test identity. Keep the relevant real chain; substitute authentication infrastructure only when outside the claim.                         | Anonymous, insufficient authority and allowed requests differ as specified; ensure denial occurs before service invocation.      |
| Slice demands repositories/infrastructure                | Inspect explicit imports, main-class annotations and direct `@ComponentScan`; configuration may defeat slicing. Remove the accidental test inclusion or separate configuration in the authorized scope. | Expected slice boots with only its needed edge replacement; full application configuration still gets its own appropriate check. |
| A renamed/missing bean is silently mocked into existence | Inspect replacement semantics and qualified bean identity. Use replacement-only behavior when proving an existing bean is replaced.                                                                     | Required original bean absence fails setup rather than passing on a newly created mock.                                          |

In Boot 4.1.1, MVC tests use `spring-boot-starter-webmvc-test` and
`org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest`. The old Boot 3 package
path is not a universal import. Match the target's modules and dependency management.
This security-aware slice also needs Boot's `spring-boot-starter-security-test`:
`spring-security-test` alone supplies request helpers but does not supply Boot's
security slice auto-configuration. Missing `HttpSecurity` during context setup can
be a test-classpath defect; removing the real chain would hide it.
`@MockitoBean` belongs to Spring Framework; it can replace **or create** by default.
For a slice where the service is intentionally excluded, creation is appropriate. For
a full wiring test, `enforceOverride = true` can protect the claim that a real bean
existed. Confirm target support before using it. Names/qualifiers matter when multiple
beans implement one interface. A spy wraps a real object and can call real code while
stubbing: avoid accidentally performing I/O during arrangement.

A nested ordinary `@Configuration` can replace the test's discovered primary
configuration; nested `@TestConfiguration` adds to it. Use top-level
`@TestConfiguration` plus explicit import for reusable test additions without making
them application scan candidates. Avoid broad bean-definition overriding just to
silence an unintended duplicate.

The fixture's `MvcSliceTest` deliberately imports `ApiErrors` and `ApiSecurity`, and
uses `@MockitoBean` on the existing concrete `TicketService`. The slice excludes the
service, so creating its mock is intentional; `enforceOverride = true` would fail here.
Framework resets the mock after each method. No service interface, fake implementation,
counter or reset hook is needed for these interaction checks. Keep an existing useful
fake when it expresses meaningful stateful behavior; this example does not need one.
The test verifies filters, CSRF, validation and a named exception handler. Its `user()` identity does not test password
validation, bearer-token decoding or a production identity provider. Adding those
claims requires the corresponding real boundary and the security specialist.

Sources checked against the Boot 4.1.1 documentation on 2026-09-28:

- [MVC slice API](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/webmvc/test/autoconfigure/WebMvcTest.html)
  specifies selective scanning and MockMvc configuration. Check the actual test
  modules for security integration rather than assuming the annotation supplies it.
- [Boot 4.1.1 security slice imports](https://github.com/spring-projects/spring-boot/blob/v4.1.1/module/spring-boot-security-test/src/main/resources/META-INF/spring/org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc.imports)
  show the security auto-configuration contributed by `spring-boot-security-test`.
- [Boot test configuration](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.spring-boot-applications.detecting-configuration)
  explains primary configuration discovery and test additions.
- [Framework bean overriding](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/bean-overriding.html)
  documents replacement strategies; inspect the Framework version resolved by the target.
- [Framework 7.0.9 MockitoBean](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/test/context/bean/override/mockito/MockitoBean.html)
  specifies create-or-replace behavior and automatic mock reset.
- [Spring Security MockMvc setup](https://docs.spring.io/spring-security/reference/servlet/test/mockmvc/setup.html)
  explains filter-chain integration for a manually built MockMvc harness.
