# Verification

Read when changing client behavior or choosing evidence for a review. Test the actual
client configuration in the target project. A standalone demonstration application,
generic peer wrapper or custom server harness is not required for ordinary mappings.

## Start with the contract the application consumes

For a component that injects a Boot `RestClient.Builder`, `@RestClientTest` and
`MockRestServiceServer` can verify the path, headers, JSON mapping and error contract.
Boot 4.1.1 provides the slice in `spring-boot-restclient-test` (or the managed
`spring-boot-starter-restclient-test` test starter). Use the package appropriate to the
project version. See [Boot client tests](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.spring-boot-applications.autoconfigured-restclient).

For an HTTP service group, test the imported interface and its real group configuration,
not a separately constructed proxy. An existing Boot context test can use
`@AutoConfigureMockRestServiceServer` on this baseline: the Boot group integration applies
the mock customizer. Ensure the server is bound to the builder used by that group;
do not assume every release or slice imports the same auto-configurations. With multiple
clients, bind/select the appropriate server explicitly instead of using an ambiguous
auto-configured server.

For the [customer-directory example](wiring-and-transports.md#a-finite-customer-lookup),
set the test group's base URL to a reserved example host and assert:

- `findById(17)` issues `GET /customers/17`, accepts JSON and decodes the provider's
  `{"id":17,"name":"Ada"}` into the record.
- A `404` remains Spring's status exception unless the application deliberately defines
  absence mapping; a failed lookup does not silently become an empty success.
- A distinctive configured header reaches that request if customization is part of the
  change. Verify expected requests so calls accidentally bypassing the configured path fail.

These checks exercise registration, mapping and status behavior. They do not exercise
the transport: `MockRestServiceServer` substitutes the request factory. The worked
snippets omit a standalone build intentionally; adapt them to the existing application
and its test setup, preserving dependency management and toolchain.

## Add real transport checks only for the changed mechanism

Use the project's mock web server or a bounded loopback endpoint when the selected
transport is part of the claim. Keep its lifecycle in the test facilities already in
use; a bespoke response tracker is justified only when response ownership itself is
under investigation.

| Changed contract         | Discriminating check                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Timeout phase            | Delay headers and stall after headers separately, with a watchdog longer than the intended timeout. Observe elapsed failure and resource release on the actual factory.                    |
| Safe failure policy      | Return `429` with delay advice and a definitive rejection; assert classification and outgoing attempt count. Do not copy secret diagnostic bodies into logs.                               |
| Uncertain mutation       | Record the effect before withholding its response; require the original intent and unresolved outcome, with no new dispatch until provider semantics permit it.                            |
| Body bound and ownership | Send oversized declared and chunked bodies, slow bodies and errors. Require early rejection or timeout, closure/cancellation and subsequent progress. Test decompressed size if supported. |
| Pool/cancellation        | Exhaust a small pool on the deployed transport, cancel body consumption, and observe release/acquisition metrics and subsequent progress.                                                  |
| TLS/destination policy   | Exercise trusted identity, wrong hostname, untrusted issuer, required client certificate and forbidden redirect destinations as applicable.                                                |

A close invocation is evidence of close ownership, not proof of socket reuse or immediate
release of every operating-system resource. Caller timeout does not prove server work
stopped. Timing tolerances detect missing limits; they are not latency measurements or
recommended production budgets. Two user identities and an absent-context case are
needed when identity propagation changes; a static convention header does not cover it.

Do not run every row for a DTO change. Conversely, compilation or a mocked exchange
cannot substantiate socket, TLS, pooling or transport cancellation claims. Report the
checks executed, actual versions/transport and remaining uncertainty. If transport tools
are unavailable, keep conclusions at the mapping/source-review level and name the
specific pending check.

Agent-behavior evaluations are separate: written cases and Java contract tests do not
demonstrate that an agent selected or followed the skill. Report comparative actor runs
separately when they were actually executed.
