# Selection test prompts — `java-legacy-code-testing`

Ten prompts. Six must select this skill (two adversarial), four must select a named neighbour
instead. Run each against the **manifest description alone** — no body, no references — because
that is what the Claude adapter installs as frontmatter and all the selector sees.

Verified at gate iteration 3 against the 1017-character `skill.yaml` description.

---

## POSITIVE — must select `java-legacy-code-testing`

### P1 — the class that cannot be constructed

> `OrderProcessor`'s constructor does `this.gateway = new PaymentGateway()`, and
> `PaymentGateway`'s constructor opens a JDBC connection. I can't get past line one of the test.
> What do I do?

**Correct behaviour:** select this skill. Name the obstacle (Construction Blob), apply
**Parameterize Constructor** (p. 379), and **keep a delegating old constructor** so no existing
caller changes — that is Preserve Signatures, and it is what makes the step safe with no test in
place. Do not reach for a mocking framework first.

### P2 — the two-day deadline

> I have to add "skip lines with a zero amount" to `InvoicePoster.post`. It's about 600 lines,
> no tests, and it ships Thursday.

**Correct behaviour:** select this skill. **Sprout Method** (p. 59): write the rule as a new,
fully tested method, call it from one line inside the body, never read the rest. State the honest
cost — the legacy body is exactly as untested as it was, and this answers "I have two days", not
"how do we fix this".

### P3 — the seam that isn't one (adversarial)

> We extracted a `PaymentGateway` interface and wrote a mock for it, but the tests still hit the
> real gateway. The interface is right there. What did we miss?

**Correct behaviour:** select this skill. The seam exists and the **enabling point** does not —
the class under test still calls `new PaymentGatewayImpl()` internally. This is the single most
useful thing Feathers's vocabulary buys, and the fix is Parameterize Constructor, not a better
mock.

### P4 — 2004-era advice

> Every guide I find says to add `mockito-inline` and use PowerMock to mock the static
> `LegacyConfig.get()`. Our build is on Mockito 5.23 and PowerMock won't resolve.

**Correct behaviour:** select this skill. Both are dead: the inline mock maker has been Mockito's
default since 5.0.0 and the artifact is frozen at 5.2.0; PowerMock's last release is 2020 and
pins `mockito-core:3.3.3`, so it cannot share a classpath with Mockito 5. Then give the design
answer — **Introduce Instance Delegator** (p. 369) or **Encapsulate Global References** (p. 339) —
with `mockStatic` as the last option, ticketed.

### P5 — the leaking seam

> Someone's PR adds `public static void setClockForTest(Clock c)` to our `BillingCycle`
> singleton. It makes the test pass. Is that OK?

**Correct behaviour:** select this skill. Feathers lists **Introduce Static Setter** (p. 372) as a
legitimate technique _and_ dislikes it, and both halves matter: it creates a mutable global. Ship
it only with a removal ticket, and consider the ArchUnit rule that fails the build when production
code reaches a `*ForTest*` member.

### P6 — output too large to assert on (adversarial)

> This report generator returns a 4 000-line XML document and I need to refactor it. Writing
> assertions for that is a week of work and I'd still miss fields.

**Correct behaviour:** select this skill. Approval testing — `Approvals.verify(String)`, not
`verify(Object)` — with `Options.withScrubber(...)` for the timestamps and ids, and
`@UseReporter(QuietReporter.class)` so CI does not try to launch a diff tool. State the cost: an
approved file records no intent, and approving a `.received` file is one keystroke.

---

## NEGATIVE — must select the named neighbour

### N1 — characterisation mechanics → `java-refactoring`

> I can already call this shipping calculator from a test. How do I write characterisation tests
> for it before I refactor?

**Correct behaviour:** `java-refactoring` (`references/safety-workflow.md`). The precondition this
skill exists for — cannot construct, cannot reach — is already satisfied. The description declines
explicitly: "Does not cover characterisation-test mechanics (java-refactoring)".

### N2 — determinism → `java-test-design`

> How do I inject a `Clock` so this test isn't date-dependent?

**Correct behaviour:** `java-test-design` (`references/determinism.md`). No legacy obstacle is
present. This was a **wrongly-captured near-miss at gate iteration 1**; the trigger
"when a method reads `LocalDate.now()`" was removed for exactly this reason, and iteration 2
confirmed the description no longer fires.

### N3 — system-level migration → `legacy-enterprise-modernization`

> We're strangling a mainframe billing integration and need to decide where to put the router.

**Correct behaviour:** `legacy-enterprise-modernization`. Note the terminology trap: that skill's
"interception point" _diverts_ traffic; Feathers's _observes_ an effect. Both skills now
disambiguate the term in both directions.

### N4 — double selection → `java-test-doubles`

> Should I mock this repository or write a fake?

**Correct behaviour:** `java-test-doubles`. The class is already constructible; the question is
which double. Declined by name in the description.

---

## Known weak spots

- **Sprout/Wrap is reachable only through P2's phrasing.** Neither description names the
  _situation_ ("add behaviour to a method too long to read, by Thursday") — it appears only as a
  capability. A prompt phrased purely as a deadline problem may under-select.
- **"when a test would need the real database"** can attract Testcontainers-setup questions that
  belong to `java-testing-strategy` or `spring-boot-testing`. It fires correctly for P1's shape
  and is a weak false-positive risk otherwise.
