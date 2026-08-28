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
3. **Is every hash salted per user, with the salt stored beside it?** A single application-wide
   constant is a badly-implemented pepper, not a salt: identical passwords produce identical
   hashes and rainbow tables apply.
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
   Token, session id, API key, OTP, salt, nonce, reset link: all wrong. A 48-bit LCG is
   predictable from two outputs. Java 17's shared `RandomGenerator` supertype makes
   `SecureRandom` and `Xoshiro256PlusPlus` look interchangeable at a call site; they are not.
9. `rg 'getInstanceStrong'` on a request path or in a bean constructor — it can block on
   `/dev/random` in a container. Reserve it for long-lived key generation.
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

## Validation at the trust boundary

16. **Is `@Valid` actually on the `@RequestBody` parameter?** Without it the annotations are
    decorative, nothing fails, and the code reads as validated.
17. **Is validation being sold as the injection control?** OWASP: "Input Validation should not
    be used as the primary method of preventing XSS, SQL Injection and other attacks."
    Parameterised queries and context-aware output encoding are the control; validation reduces
    impact. If a review comment says "we validate, so we're safe from SQLi", that is the finding.
18. **Is the allowlist a denylist wearing a hat?** Denylists are "trivial for an attacker to
    bypass" and "frequently prevent authorized input, like `O'Brian`". Allowlist _structure_ —
    length, charset class, format — for identifiers, dates and enums; you cannot allowlist a
    product description, and `[a-zA-Z]` for names is a bug report waiting to happen.
19. **Does one layer normalise and another validate the original?** Trim/lowercase/strip in one
    place and the check in another is check-then-use on two different values.
20. **Is a regex applied to attacker-controlled input?** Java's `java.util.regex` backtracks;
    nested quantifiers plus hostile input is a DoS. Mechanics belong to `java-strings-and-text`.
21. **Do untrusted bytes reach `ObjectInputStream` or polymorphic Jackson?** Stop and route to
    `java-serialization-hardening`; write nothing about filters or gadget chains here.

## Secrets and leakage

22. `rg -i 'password|secret|token|api[-_]?key' -- '*.yml' '*.yaml' '*.properties'` — a literal
    value means git history holds it permanently. Rotating without purging history is not
    remediation.
23. **Is a secret in an environment variable being treated as sufficient?** OWASP's Secrets
    Management Cheat Sheet discourages it in its _Containers & Orchestrators_ section: visible
    in `/proc`, in `docker inspect`, in crash dumps and to child processes. Prefer a mounted
    file or an in-memory fetch from a secret store.
24. **Is there secret scanning in CI at all** (`gitleaks`, `trufflehog`, platform scanning)?
    Without it, findings 22–23 are made by an outsider.
25. **Does a record, a Lombok `@Data` class or a JPA entity carry a secret and generate
    `toString()` from it?** `log.info("processing {}", request)` then leaks a value nobody wrote
    into a log statement. Redaction at the encoder (`structured-logging`) is the backstop;
    keeping it out of the type is the control.
26. **Does `e.getMessage()` reach an HTTP body?** _Effective Java_ Item 75 says do not put
    passwords or keys in detail messages; the corollary is not to put detail messages in
    responses — they leak SQL, file paths, class names and internal hostnames. The _shape_ of
    the error contract belongs to `rpc-and-api-contracts`, the hierarchy to
    `java-exception-design`; take only the leakage angle.
27. **Was a token or `Authorization` header logged at DEBUG "just while we debug this"?**

## What not to raise

- `UUID.randomUUID()` for a token, **unless ASVS L2 is the bar** (finding 10). It is not a
  cryptographic weakness; it is a conformance one, and only sometimes.
- bcrypt at strength ≥ 12 as though it were an incident. It is a direction-of-travel finding:
  migrate opportunistically via `upgradeEncoding`, do not open a project.
- A missing `char[]`. The memory-scrubbing argument is largely obsolete on a modern collector
  (`password-storage.md` §7); raise it only where a JDK API takes `char[]` and the code is
  fighting it.
- A middle-layer check duplicating a boundary check. Real, but it is
  `java-defensive-programming`'s finding, not this skill's.
- Composition rules as a _strengthening_. NIST 800-63B-4 SHALL NOT; ASVS 6.2.5 agrees.

## Verification — how you know it improved

Design changes in this area are verifiable, and each one should be:

| Change                                 | The test that could not be written before                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Authorisation moved into the operation | Call the domain method directly with a foreign actor; assert refusal — no web layer needed |
| Dummy-hash on the not-found path       | Time both paths; the difference should be noise, not one KDF run                           |
| Constant-time comparison               | Assert the call site is `MessageDigest.isEqual`; the timing itself is not unit-testable    |
| Parameters raised to OWASP             | Assert the encoder's configured `m`/`t`/`p` or iteration count                             |
| `upgradeEncoding` wired in             | Store a hash at the old cost, log in, assert the stored hash changed                       |
| Secret removed from a type             | Assert `toString()` of the type does not contain the value                                 |

Two further signals, both cheap:

- **Callers found.** After moving a check into the domain, count the call sites that now must
  supply an actor. Each one that previously ran unchecked was a live defect.
- **Files touched to change one parameter.** Raising a cost factor should touch one file. If it
  touches several, the parameters are scattered and the next raise will miss one.
