---
name: java-application-security-basics
description: >
  Application-level security judgement in Java 21+ code: password storage with a memory-hard
  KDF at current parameters, constant-time comparison, cryptographically secure randomness,
  authorisation as a precondition of the domain operation rather than an annotation on the
  controller, the adversarial half of input validation, and secrets that never reach source,
  config, toString() or an error message. Use when a password, hash, salt, token, API key or
  pepper appears in a diff; when MessageDigest, SecureRandom, Random, UUID or a
  PasswordEncoder is called; when @PreAuthorize sits on a controller while a scheduler or
  consumer calls the same service method; when the acting user's id is read from the path
  not the principal; when a CryptoUtils wrapper is proposed "to swap algorithms later"; or
  when reviewing "is this secure enough to ship". Code-level only — layered validation is
  java-defensive-programming, redaction is structured-logging, ReDoS is
  java-strings-and-text, deserialisation is java-serialization-hardening.
---

# Java Application Security Basics

## Purpose

The code-level half of application security — the decisions that survive replacing the
security framework. It prevents two failures: "I used the framework default" mistaken for
"I followed current guidance", and authorisation that lives only at the HTTP entry point.

## Scope

**Covers:** password storage and verification, secure randomness, authorisation as a
precondition of the domain operation, the adversarial half of input validation, secrets in
source and in types, and the realistic form of "rolling your own crypto".

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
   caller. Keep the controller annotation as cheap early rejection; it stops being the only
   check. Authorise the _instance_: "has role CUSTOMER" without "and this order is theirs".
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

IF existing bcrypt at strength >= 12
THEN not an incident: migrate opportunistically via DelegatingPasswordEncoder and
     upgradeEncoding on next login, never as a scheduled project. At strength 10 (the
     Spring default) raise the strength first — cheaper, and buys more security.

IF a caller identity or resource owner is read from the request
THEN it is a claim, not an identity: take the subject from the authenticated principal.

IF comparing a hash, a MAC or any secret
THEN MessageDigest.isEqual, never Arrays.equals or String.equals.

IF a value must be unguessable (session id, reset token, API key, OTP, salt)
THEN new SecureRandom(); never Random, ThreadLocalRandom or Math.random().
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
- Same response, same work done, whether or not the account exists: `orElseThrow()` before
  the comparison — or distinct not-found/not-permitted errors — is an enumeration oracle.
- A record component or Lombok `@Data` field holding a secret is in `toString()` by
  construction, and `log.info("processing {}", request)` is then a leak nobody wrote.
- Two moves make code worse. **Encrypting what only needs hashing** ("so we can support
  password recovery") trades away the property that mattered — a dump yields no passwords —
  for a feature that is itself a defect, and adds a key needing rotation and custody. **The
  custom crypto wrapper**, `CryptoUtils.hash(String)` "for flexibility", has a signature too
  narrow for Argon2's parameters and drops the algorithm identifier the `{id}` format carries
  per hash, destroying the migration path it was built for — that, not implementing AES, is
  rolling your own crypto.

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
