---
name: java-application-security-basics
description: >
  Application-security judgement for Java 21+: password storage with current memory-hard KDF
  parameters, constant-time verification, secure randomness, authorisation inside the protected
  operation, adversarial validation, reversible-cryptography boundaries, and secret-safe types.
  Use when a password, hash, salt, token, API key or pepper appears in a diff; when
  MessageDigest, SecureRandom, Random, UUID, Cipher, Mac or PasswordEncoder is called; when a
  controller annotation is the only authorisation check; when identity comes from the request
  instead of the principal; or when a generic CryptoUtils wrapper is proposed. Code-level only:
  layered validation is java-defensive-programming, redaction is structured-logging, ReDoS is
  java-strings-and-text, and deserialisation is java-serialization-hardening.
---

# Java Application Security Basics

## Purpose

The code-level half of application security — the decisions that survive replacing the
security framework. It prevents two failures: "I used the framework default" mistaken for
"I followed current guidance", and authorisation that lives only at the HTTP entry point.

## Scope

**Covers:** password storage and verification, secure randomness, authorisation as a
precondition of the domain operation, the adversarial half of input validation, secrets in
source and in types, and safe review boundaries for reversible cryptography.

**Does not cover:** transport security, nor framework configuration — filter chains, JWT and
OAuth2 resource server, method-security wiring and CORS belong to `spring-security-for-apis`,
in a different repository, not installed alongside this skill. Nor does it apply to a service
with no credential store, no untrusted input and no per-instance ownership rule: threading an
`Actor` through that domain is cost, no benefit.

## Workflow

1. **Name the asset and the reachable attacker.** "A leaked database backup" and "another
   tenant's authenticated user" lead to different code; "make it more secure" leads to none.
2. **Read the KDF parameters, not the class name.** Spring Security's own defaults sit below
   current OWASP guidance, so "I used `PasswordEncoderFactories`" is not a compliance claim:

   |                    | Spring Security 7.1 default                                | OWASP (fetched 2026-08-27)  |
   | ------------------ | ---------------------------------------------------------- | --------------------------- |
   | Argon2id           | `m=16384 KiB, t=2, p=1` (`defaultsForSpringSecurity_v5_8`) | `m=19456 KiB` at `t=2, p=1` |
   | PBKDF2-HMAC-SHA256 | 310,000 iterations                                         | 600,000 iterations          |
   | bcrypt             | strength 10                                                | 10 is the stated _minimum_  |

   `DelegatingPasswordEncoder.idForEncode` is still `"bcrypt"` in 7.1.1, not Argon2id — so
   "Spring defaults to the OWASP-recommended algorithm" is wrong on both algorithm and
   parameters. `new Argon2PasswordEncoder(16, 32, 1, 19456, 2)` closes the Argon2 gap.

3. **Make authorisation a precondition of the domain operation** — it takes the acting
   principal and refuses, rather than trusting that the caller which checked is the only
   caller. The parameter is a compile-time obligation, not proof of identity: construct it only
   from a trusted authentication context, and do not let request JSON supply roles or tenant.
   Keep the controller annotation as cheap early rejection; it stops being the only check.
   Authorise the _instance_: "has role CUSTOMER" without "and this order is theirs".
4. **Allowlist attacker-controlled input as structure, but it is not the control** — regex over
   hostile input is a DoS vector (`java-strings-and-text`); hostile bytes are
   `java-serialization-hardening`.
5. **Trace every secret from where it enters to everywhere it can be rendered** — source,
   config, `toString()`, `equals`, an exception message, an HTTP error body. Redaction at the
   log encoder is `structured-logging`'s backstop; keeping it out of the type is the control.
6. **Verify** against `references/review.md` — a rule you cannot check on a diff is no rule.

## Decision rules

```text
IF greenfield password storage
THEN Argon2id at OWASP parameters, not the encoder's defaults.

IF existing bcrypt at a measured adequate cost
THEN keep verification support and migrate on successful authentication; schedule forced
     migration only when compliance, compromise evidence, an unacceptable cracking model,
     inactive accounts or the 72-byte legacy estate justify its user and operational cost.

IF a caller identity or resource owner is read from the request
THEN it is a claim, not an identity: take the subject from the authenticated principal.

IF comparing fixed-width hashes, MACs or token digests
THEN MessageDigest.isEqual (or the vetted library verifier), never Arrays.equals or
     String.equals; reject or canonicalise representation before decoding and keep compared
     lengths fixed. Passwords go through PasswordEncoder.matches, not a digest comparison.

IF a value must be unguessable (session id, reset token, API key, OTP, salt)
THEN generate an explicit entropy budget with SecureRandom; never Random, ThreadLocalRandom or
     Math.random(). Store reset/API tokens as a digest, bind purpose and subject, expire them,
     and consume single-use tokens atomically.

IF plaintext must be recovered later
THEN define the threat model and key custody first; use a vetted AEAD construction with an
     explicit transformation, unique nonce per key and versioned envelope. Never use
     Cipher.getInstance("AES"), ECB, unauthenticated CBC, or a reusable fixed GCM nonce.
```

## Rules

- Password length policy conflicts between the two standards teams cite, so say which one binds
  instead of picking silently: NIST SP 800-63B-4 (26 Aug 2025) makes 15 characters a **SHALL**
  where the password is the _single_ factor (8 within MFA); ASVS 5.0 §6.2.1 sets the floor at
  8, 15 recommended. The deciding question is not which is stricter but _which regime does this
  system answer to, and is the password ever the only factor?_ Both forbid composition rules
  and periodic rotation regardless — and never write that "NIST relaxed the password rules": it
  dropped composition and expiry and **raised** the single-factor floor. Requirement text and
  the three questions that settle it: `references/password-policy.md`.
- bcrypt's 72-**byte** ceiling now fails loudly, not silently: since the CVE-2025-22228 fix
  (6.3.8 / 6.4.4, March 2025) `encode` throws `IllegalArgumentException` above it, so a form
  advertising 128-character passphrases 500s at sign-up, and any re-encode — password change,
  or a rehash under `upgradeEncoding` — throws for users whose stored hash predates the fix.
  `matches` still skips the guard, so legacy hashes keep the ASVS 6.2.8 truncation. Cap at 72
  bytes at the boundary, or use Argon2id.
- Make account-existence paths observationally similar: the same external response, one KDF
  on both paths, and shared throttling. This mitigates rather than proves indistinguishability:
  caches, database work, network jitter and downstream side effects remain measurable.
  `orElseThrow()` before comparison — or distinct not-found/not-permitted errors — is an
  enumeration oracle.
- Treat authorisation and mutation as one consistency decision. A check against an object read
  in one transaction followed by an unconditional write in another is a TOCTOU bug; use a
  transaction with the required isolation, a version/CAS predicate, or a conditional update
  that includes tenant/owner and expected state. Returning `404` for both absent and forbidden
  resources hides detail from the caller but is not the authorisation control.
- Password-reset and API-key flows are credential systems, not random-string helpers. Generate
  at least the entropy required by the applicable standard, display the raw value once, store
  only a domain-separated digest, enforce purpose/subject/expiry, and atomically mark it used.
  Rate-limit redemption; do not log query strings containing bearer material.
- Hash what only needs equality verification; encrypt only what the application must recover.
  With reversible data, `Cipher.getInstance("AES")` delegates mode and padding to the provider.
  Prefer a platform/KMS envelope or a reviewed `AES/GCM/NoPadding`/ChaCha20-Poly1305 facility;
  authenticate tenant, record id, schema and key version as AAD where those fields must not be
  swappable. Nonce uniqueness is per key, and decrypt must release no plaintext before tag
  verification. Store algorithm, key version, nonce and ciphertext/tag so rotation is possible;
  never store the data-encryption key beside the ciphertext it protects.
- A record component or Lombok `@Data` field holding a secret is in `toString()` by
  construction, and `log.info("processing {}", request)` is then a leak nobody wrote.
- Two moves make code worse. **Encrypting what only needs hashing** ("so we can support
  password recovery") trades away the property that mattered — a dump yields no passwords —
  for a feature that is itself a defect, and adds a key needing rotation and custody. **The
  custom crypto wrapper**, `CryptoUtils.hash(String)` "for flexibility", has a signature too
  narrow for Argon2's parameters and drops the algorithm identifier the `{id}` format carries
  per hash, destroying the migration path it was built for — that, not implementing AES, is
  rolling your own crypto.

## Failure modes and production evidence

| Symptom                                              | Distinguish with                                                                    | Likely remediation                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Login latency or CPU jumps after a KDF change        | KDF duration histogram by encoded algorithm id; auth concurrency and CPU saturation | Bound authentication concurrency, benchmark on production-class hardware, then tune parameters without dropping below the binding floor |
| Known users and unknown users have separable latency | Distributions, not one stopwatch sample; include warm/cold cache paths              | Dummy hash with current parameters, common response path and rate limiting; remove existence-specific downstream work                   |
| Cross-tenant mutation despite role checks            | Audit subject, tenant, resource owner and write predicate; enumerate every caller   | Derive subject from trusted context and include owner/tenant/version in the transactional write condition                               |
| Reset link works twice or after replacement          | Concurrent redemption and replay tests against the real datastore                   | Digest-at-rest, expiry and one atomic consume/update; invalidate older outstanding tokens intentionally                                 |
| Secret appears after an exception                    | Structured-log and error-contract tests with canary secrets                         | Secret-free value types/messages, allowlisted error mapping and encoder-side redaction as a backstop                                    |

Do not benchmark password verification with JMH alone and call the capacity question solved.
Measure the primitive to choose parameters, then load-test the bounded authentication path:
arrival bursts, dummy-hash misses, rehash-on-login, datastore latency and rate limiting determine
whether an attacker can turn the KDF into a CPU or memory-exhaustion endpoint.

## References

- [Password storage](references/password-storage.md) — OWASP parameter tables, the
  Argon2id-versus-bcrypt disagreement and its JVM complication, Spring Security encoder facts,
  peppering, randomness, `char[]` versus `String`. Read at step 2, and before designing a type
  that holds a credential.
- [Password policy](references/password-policy.md) — NIST 800-63B-4 and ASVS 5.0 requirement
  text side by side. Read when setting registration or change-password rules.
- [Before and after](references/before-after.md) — the non-constant-time comparison in Urma &
  Warburton's Twootr chapter and its fix, and authorisation moved into the domain. Steps 2, 3.
- [Review prompts and verification](references/review.md) — the failure catalogue as
  questions and grep patterns, and how to tell the change improved something. Read at step 6.
