# Review prompts, grep patterns and verification

The questions to ask about code in this area, ordered by how often the answer is wrong. Each
one is checkable against a diff; where a mechanical signal exists it is given. Findings from
this pass are recorded, not silently fixed.

## Password storage

1. **What are the actual KDF parameters, and when were they last benchmarked?** Not the class
   name. `defaultsForSpringSecurity_v5_8()`, `new BCryptPasswordEncoder()` and
   `createDelegatingPasswordEncoder()` are all _below_ current OWASP guidance
   (`password-storage.md` §3). If no date is recorded anywhere, that is the finding.
2. **Is a general-purpose digest being used as a password hash?**
   `rg 'MessageDigest\.getInstance\("(SHA|MD5)'` near anything called password. SHA-256 is fast
   by design; a modern GPU does billions per second. Note the confusing corner: the same class's
   `isEqual` is the _right_ call for comparison.
3. **Is every hash salted per user, with the salt stored beside it?** A public application-wide
   constant is neither a per-password salt nor a pepper (a pepper must be secret): identical
   passwords remain linkable and one precomputation can attack the whole application.
4. **How is the comparison done?** `rg 'Arrays\.equals|\.equals\(' ` in any file that also
   mentions hash, token, mac, signature or secret. `MessageDigest.isEqual` or the encoder's
   own `matches` — never `Arrays.equals`, never `String.equals`, never `==`.
5. **Is there a rehash path?** `rg 'upgradeEncoding'`. Without it, a cost increase or an
   algorithm change reaches only new users, forever.
6. **Does registration cap input at 72 bytes if bcrypt is in use?** Spring Security ≥ 6.3.8 /
   6.4.4 **does** check on `encode` and throws
   `IllegalArgumentException("password cannot be more than 72 bytes")` — the CVE-2025-22228
   fix. So the symptom is a 500 at sign-up, not a silent compliance hole, and the finding is
   the missing boundary check. `matches` still skips the guard, so legacy hashes verify by
   truncation (ASVS 6.2.8) and any re-encode of an over-length password — password change or a
   rehash under `upgradeEncoding` — now throws for that user. See `password-storage.md` §3.
7. **Does a domain type's `equals`/`hashCode` include the hash or the secret?** Both a timing
   leak and a `hashCode` hazard.

## Randomness

8. `rg 'new Random\(|Math\.random\(|ThreadLocalRandom'` — then ask what the value is used for.
   Token, session id, API key, OTP, salt, nonce, reset link: all wrong. `Random` uses a 48-bit
   linear-congruential generator; `ThreadLocalRandom` uses different implementation machinery
   but its Javadoc also says it is not cryptographically secure. Java 17's shared
   `RandomGenerator` supertype makes `SecureRandom` and `Xoshiro256PlusPlus` look interchangeable
   at a call site; they are not.
9. `rg 'getInstanceStrong'` on a request path or in a bean constructor — it selects from the
   deployment's `securerandom.strongAlgorithms` property and the selected provider may block.
   It is not a universal "more secure" switch: state the required strength/provider behavior,
   initialise deliberately, and load-test the actual runtime image.
10. `UUID.randomUUID()` as a token is **not a cryptographic defect** — 122 bits from a CSPRNG,
    version 4, and the common objection confuses it with UUID v1. It **is** a finding under an
    ASVS L2 assessment: 11.5.1 ends "Note that UUIDs do not respect this condition", naming
    them as not meeting the 128-bit bar. Ask which applies before raising it: where L2 is
    claimed, emit 16 bytes from `SecureRandom` Base64url-encoded; otherwise leave it.
    `UUID.nameUUIDFromBytes` is deterministic MD5 and is unsafe in every context.

## Authorisation

11. **Where does the authorisation decision live, and who else calls that method?** `rg` the
    service method name. A `@PreAuthorize` on one controller plus a scheduler, a message
    consumer, a GraphQL resolver or a second controller calling the same method is an unchecked
    path, and it is the most common finding in this whole list.
12. **Is the check per resource instance or per resource type?** "Has role CUSTOMER" without
    "and this order belongs to them" is IDOR/BOLA.
13. **Where does the subject come from?** `rg '@PathVariable.*[Uu]serId|getUserId\(\)'` in a
    controller — an id from the path, the body or a custom header is a claim, not an identity.
14. **Does the not-found path differ from the not-permitted path?**
    `findById(id).orElseThrow()` _before_ the ownership check, or two distinct error messages,
    is an enumeration oracle.
15. **Can the domain object reach an invalid state by a path that bypasses the DTO?** A
    repository `save`, a test fixture, a migration-loaded row, a message handler. The DTO is not
    the trust boundary; the constructor is.
16. **Who is allowed to construct the actor?** A parameter named `Actor` is an obligation, not
    authentication. If roles or tenant arrive from request JSON, the design has only moved the
    confused-deputy bug.
17. **Can ownership or state change between check and write?** If read/check and mutation are
    separated by a transaction boundary, require an owner/tenant/version predicate on the
    write or appropriate transaction isolation. A unit test of the Java `if` cannot prove this.

## Validation at the trust boundary

18. **Is `@Valid` actually on the `@RequestBody` parameter?** Without it the annotations are
    decorative, nothing fails, and the code reads as validated.
19. **Is validation being sold as the injection control?** OWASP: "Input Validation should not
    be used as the primary method of preventing XSS, SQL Injection and other attacks."
    Parameterised queries and context-aware output encoding are the control; validation reduces
    impact. If a review comment says "we validate, so we're safe from SQLi", that is the finding.
20. **Is the allowlist a denylist wearing a hat?** Denylists are "trivial for an attacker to
    bypass" and "frequently prevent authorized input, like `O'Brian`". Allowlist _structure_ —
    length, charset class, format — for identifiers, dates and enums; you cannot allowlist a
    product description, and `[a-zA-Z]` for names is a bug report waiting to happen.
21. **Does one layer normalise and another validate the original?** Trim/lowercase/strip in one
    place and the check in another is check-then-use on two different values.
22. **Is a regex applied to attacker-controlled input?** Java's `java.util.regex` backtracks;
    nested quantifiers plus hostile input is a DoS. Mechanics belong to `java-strings-and-text`.
23. **Do untrusted bytes reach `ObjectInputStream` or polymorphic Jackson?** Stop and route to
    `java-serialization-hardening`; write nothing about filters or gadget chains here.

## Secrets and leakage

24. `rg -i 'password|secret|token|api[-_]?key' -- '*.yml' '*.yaml' '*.properties'` — a literal
    value means git history holds it permanently. Rotating without purging history is not
    remediation.
25. **Is a secret in an environment variable being treated as sufficient?** OWASP's Secrets
    Management Cheat Sheet discourages it in its _Containers & Orchestrators_ section: visible
    in `/proc`, in `docker inspect`, in crash dumps and to child processes. Prefer a mounted
    file or an in-memory fetch from a secret store.
26. **Is there secret scanning in CI at all** (`gitleaks`, `trufflehog`, platform scanning)?
    Without it, findings 22–23 are made by an outsider.
27. **Does a record, a Lombok `@Data` class or a JPA entity carry a secret and generate
    `toString()` from it?** `log.info("processing {}", request)` then leaks a value nobody wrote
    into a log statement. Redaction at the encoder (`structured-logging`) is the backstop;
    keeping it out of the type is the control.
28. **Does `e.getMessage()` reach an HTTP body?** _Effective Java_ Item 75 says do not put
    passwords or keys in detail messages; the corollary is not to put detail messages in
    responses — they leak SQL, file paths, class names and internal hostnames. The _shape_ of
    the error contract belongs to `rpc-and-api-contracts`, the hierarchy to
    `java-exception-design`; take only the leakage angle.
29. **Was a token or `Authorization` header logged at DEBUG "just while we debug this"?**
30. **Are bearer credentials lifecycle-safe?** Reset tokens and API keys need adequate entropy,
    digest-at-rest, purpose/subject binding, expiry, atomic single use or revocation, and rate
    limiting. Searching only for `SecureRandom` misses replay and database-disclosure failures.

## Reversible cryptography

31. `rg 'Cipher\.getInstance\("[A-Za-z0-9-]+"\)'` — an algorithm-only transformation delegates
    mode and padding to the provider. `"AES"` commonly selects ECB in SunJCE, but the portable
    defect is reliance on an unspecified provider default. Require an explicit reviewed
    transformation.
32. **Why is this encrypted rather than hashed, tokenised or omitted?** If equality verification
    is enough, recovery and key custody are avoidable liabilities. If recovery is required,
    identify who can call decrypt and what a datastore-only attacker obtains.
33. **Where is nonce uniqueness enforced per key?** Random GCM nonces need a collision budget;
    counters need durable allocation and crash behavior. "Generated with SecureRandom" is not
    proof of uniqueness at high volume, and a fixed nonce is catastrophic reuse.
34. **What is authenticated as AAD?** Tenant, record id, schema/purpose and key version often
    need binding so a valid ciphertext cannot be transplanted into another context.
35. **Can keys rotate without decrypting everything in one outage window?** Require a versioned
    envelope, old-key read/new-key write, auditable re-encryption, rollback semantics and a
    retirement criterion. Ensure data-encryption keys are not stored with the ciphertext.

## What not to raise

- `UUID.randomUUID()` for a token, **unless ASVS L2 is the bar** (finding 10). It is not a
  cryptographic weakness; it is a conformance one, and only sometimes.
- bcrypt at an adequate, measured cost as though the algorithm name alone were an incident.
  Prefer opportunistic migration, but make an explicit project when compliance, compromise
  evidence, inactive accounts or legacy >72-byte semantics require one.
- A missing `char[]` by itself. Explicit clearing can shorten exposure but cannot guarantee
  erasure of collector or framework copies (`password-storage.md` §7); raise it where lifetime
  control is real or a JDK API already accepts `char[]`, not as ceremonial compliance.
- A middle-layer check duplicating a boundary check. Real, but it is
  `java-defensive-programming`'s finding, not this skill's.
- Composition rules as a _strengthening_. NIST 800-63B-4 SHALL NOT; ASVS 6.2.5 agrees.
- A hand-written GCM helper as a harmless abstraction. Nonce allocation, AAD, envelope version,
  tag failure, key custody and rotation are the design; hiding them behind `encrypt(byte[])`
  makes the unsafe choices impossible to review.

## Verification — how you know it improved

Design changes in this area are verifiable, and each one should be:

| Change                                 | The test that could not be written before                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Authorisation moved into the operation | Call the domain method directly with a foreign actor; assert refusal — no web layer needed |
| Dummy-hash on the not-found path       | Compare latency distributions across warm/cold paths; no class should omit a KDF run       |
| Constant-time comparison               | Assert the call site is `MessageDigest.isEqual`; the timing itself is not unit-testable    |
| Parameters raised to OWASP             | Assert the encoder's configured `m`/`t`/`p` or iteration count                             |
| `upgradeEncoding` wired in             | Store a hash at the old cost, log in, assert the stored hash changed                       |
| Secret removed from a type             | Assert `toString()` of the type does not contain the value                                 |
| Single-use token lifecycle             | Race two redemptions against the real datastore; exactly one transition succeeds           |

Two further signals, both cheap:

- **Callers found.** After moving a check into the domain, count the call sites that now must
  supply an actor. Each one that previously ran unchecked was a live defect.
- **Files touched to change one parameter.** Raising a cost factor should touch one file. If it
  touches several, the parameters are scattered and the next raise will miss one.
