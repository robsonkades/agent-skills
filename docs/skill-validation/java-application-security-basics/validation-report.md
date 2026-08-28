# Validation report — `java-application-security-basics`

**Iteration 1.** Validated 2026-08-27 by an independent validator (did not author the skill).

**Gate result: FAIL.** PASS requires zero BLOCKER and zero MAJOR. Found **1 BLOCKER, 3 MAJOR,
6 MINOR, 6 NIT**.

Method: every Spring Security fact was checked against the `spring-security-crypto:7.1.1`
**sources jar from Maven Central** (not `main`, not memory); every OWASP/NIST/ASVS number
against the raw upstream Markdown; the book claim against the authors' repository; and every
Java sample was compiled with `javac --release 21` and, where it had observable behaviour,
executed on JDK 25.0.3 against the real jars.

---

## BLOCKER

### B1. The bcrypt 72-byte claim is false for the version the skill names — Spring Security _does_ check

- `SKILL.md:105-107` — "bcrypt truncates at 72 bytes and Spring Security does not check it,
  so a form advertising 128-character passphrases … violates ASVS 6.2.8 … **silently**."
- `references/password-storage.md:89-93` — "**The 72-byte gap, verified.** `BCryptPasswordEncoder`
  calls `BCrypt.hashpw(rawPassword.toString(), salt)` **with no length check**, so a
  200-character passphrase is **silently truncated** at 72 bytes."
- `references/review.md:26-28` — "Spring Security does not check, and silent truncation
  satisfies ASVS 6.2.9 while violating 6.2.8."
- The research brief states the same thing (`research-brief.md:431-437`, "**Verified gap**").
  Skill and brief agree and both are wrong — per the validation contract, that is a BLOCKER.

**Evidence.** `spring-security-crypto-7.1.1-sources.jar`,
`org/springframework/security/crypto/bcrypt/BCrypt.java`, in `hashpw(byte[], String, boolean)`:

```java
// Enforce max length for new passwords only
if (!for_check && passwordb.length > 72) {
    throw new IllegalArgumentException("password cannot be more than 72 bytes");
}
```

Executed against the real jar:

```
5a. encode(>72 bytes) THROWS: password cannot be more than 72 bytes
5b. matches(72+tail, hash-of-72) = true   [truncation still visible on the verify path]
5c. bcrypt default hash prefix: $2a$10$
```

The guard was added by the fix for **CVE-2025-22228** (`BCryptPasswordEncoder.matches` returned
true for passwords >72 chars sharing a 72-char prefix), shipped in OSS 6.3.8 / 6.4.4 and
enterprise 5.7.16 / 5.8.18 / 6.0.16 / 6.1.14 / 6.2.10 — i.e. every supported line since
March 2025, and certainly 7.1.1.

**Why it matters.** The skill's stated failure mode ("silent" truncation, an invisible
compliance hole) is precisely inverted: on any patched version the application throws
`IllegalArgumentException` out of `PasswordEncoder.encode` and the user sees a 500 at
registration. An agent applying this skill will hunt for a silent defect that cannot exist,
and will miss the real one.

**Fix.** Replace the three passages with the verified behaviour:

- `encode()` **throws** `IllegalArgumentException("password cannot be more than 72 bytes")` for
  input over 72 bytes on Spring Security ≥ 6.4.4 / 6.3.8 / 5.8.18. A registration form that
  advertises 128-character passphrases therefore fails loudly, not silently — the finding is a
  missing boundary check that produces a 500, not a hidden ASVS 6.2.8 violation.
- `matches()` still bypasses the guard (`for_check == true`), so hashes written _before_ the
  upgrade keep the truncating comparison, and **users whose stored password exceeded 72 bytes
  can no longer log in and must reset** — the migration note the skill currently lacks.
- On versions predating the fix, the original "silent truncation" text is correct; date it.
- Keep the remediation (cap at 72 **bytes** at the boundary, or use Argon2id) — it is right for
  both worlds, and it is now the fix for an availability bug as well as a correctness one.
- Optional but strong: **CVE-2025-22234** — the same max-length fix broke
  `DaoAuthenticationProvider`'s timing mitigation and reintroduced a username-enumeration
  oracle. That is the skill's own step-2/rule-3 subject, arriving from the framework rather
  than from the reviewed code, and it is the kind of thing this skill exists to know.

---

## MAJOR

### M1. ASVS 11.5.1 explicitly excludes UUIDs; the skill tells the reviewer to never raise it

`references/review.md:38` — "`UUID.randomUUID()` as a token is **fine** (122 bits, CSPRNG).
**Do not raise it as a finding.**"
`references/password-storage.md:164-166` — "`UUID.randomUUID()` **is** fine as a token … just
under ASVS 11.5.1's 128-bit bar."

**Evidence.** `OWASP/ASVS@master:5.0/en/0x20-V11-Cryptography.md:77`, requirement 11.5.1 (L2),
verbatim:

> Verify that all random numbers and strings which are intended to be non-guessable must be
> generated using a cryptographically secure pseudo-random number generator (CSPRNG) and have
> at least 128 bits of entropy. **Note that UUIDs do not respect this condition.**

The skill quotes this requirement (`password-policy.md:59-60`) with the final sentence dropped,
then instructs the reviewer to suppress exactly the finding the requirement creates. The two
underlying facts are correct (`UUID.randomUUID()` javadoc: "generated using a cryptographically
strong pseudo random number generator"; version 4 confirmed at runtime; 122 bits), but the
_instruction_ contradicts the standard the skill cites as authority — and it also sits awkwardly
against `SKILL.md:90-91`, whose decision rule demands `new SecureRandom()` for "session id,
reset token, API key, OTP" with no UUID carve-out.

**Fix.** In `review.md:38` and `password-storage.md:164-166`, say: "not a cryptographic defect —
122 bits from a CSPRNG, and the common objection confuses it with UUID v1. It **is** a finding
under an ASVS L2 assessment: 11.5.1 names UUIDs explicitly as not meeting the 128-bit bar. Where
ASVS L2 is claimed, emit 16 bytes from `SecureRandom` and Base64url-encode them; elsewhere leave
it alone." Add the omitted sentence to the 11.5.1 quote in `password-policy.md`.

### M2. "Spring Security 7.0+ additions" misdates two of the seven items

`references/password-storage.md:105-109` groups `HaveIBeenPwnedRestApiPasswordChecker` and
`/.well-known/change-password` support with the five password4j encoders as "Spring Security 7.0+
additions". `password-policy.md:98` repeats "Spring Security 7 ships
`HaveIBeenPwnedRestApiPasswordChecker`".

**Evidence** (7.1.1 sources jars):

| Item                                                            | Actual module / package                                                             | `@since`                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| `HaveIBeenPwnedRestApiPasswordChecker`                          | spring-security-**web**, `org.springframework.security.web.authentication.password` | **6.3**                                    |
| `CompromisedPasswordChecker` (its interface)                    | spring-security-core, `…authentication.password`                                    | **6.3**                                    |
| `/.well-known/change-password` (`PasswordManagementConfigurer`) | spring-security-config                                                              | **5.6**                                    |
| the five `*Password4j*` encoders                                | spring-security-crypto, `…crypto.password4j`                                        | 7.0 — confirmed absent from the 6.5.11 jar |

A team on Boot 3.3/3.4 reads this and concludes the ASVS 6.2.12 breach check requires an upgrade
to Spring Security 7. It has been available to them since May 2024, and it is not even in the
module the paragraph is about.

**Fix.** Split the paragraph: keep the five password4j encoders as the 7.0 addition; move the
breach checker to its own line with "`org.springframework.security.web.authentication.password
.HaveIBeenPwnedRestApiPasswordChecker` (spring-security-**web**, since 6.3), implementing
`CompromisedPasswordChecker` (spring-security-core, since 6.3)"; drop the change-password item or
mark it "since 5.6". Also **retire the `UNVERIFIED:` marker at line 110** for the packages — the
five encoders are all in `org.springframework.security.crypto.password4j` in the 7.1.1 jar
(constructor signatures remain unread, so keep that half of the marker).

### M3. The stated dependency set does not run — `spring-security-crypto` is not self-contained

`references/password-storage.md:57-58` — "`spring-security-crypto` is standalone — no Spring
context dependency. You do not need the framework to use `PasswordEncoder`."
`references/before-after.md:3-5` — "Example A compiles against
`org.springframework.security:spring-security-crypto:7.1.1` and
`org.bouncycastle:bcprov-jdk18on:1.85.2`."

**Evidence.** Example A's `PasswordVerifier` compiles against exactly those two coordinates, and
then dies on the first `matches` call:

```
Exception in thread "main" java.lang.NoClassDefFoundError: org/springframework/util/StringUtils
    at ...crypto.password.AbstractValidatingPasswordEncoder.matches(AbstractValidatingPasswordEncoder.java:49)
```

Every encoder also holds a `LogFactory.getLog(...)` field, so `commons-logging` is required to
construct one. The 7.1.1 POM declares **neither** (its only dependency is an optional runtime
`assertj-core`), so a build tool will not supply them.

**Fix.** Change the sentence to "`spring-security-crypto` needs no Spring _context_ — but as of
7.1.1 it needs `spring-core` (`org.springframework.util.StringUtils`, used by
`AbstractValidatingPasswordEncoder`) and `commons-logging` on the classpath, and its POM declares
neither." Add both to the coordinate list at the top of `before-after.md`.

---

## MINOR

### m1. `before-after.md:3-5` — "example B against the JDK alone" is false

Example B's _Before_ uses `@RestController`, `@PostMapping`, `@PathVariable` (spring-web),
`@PreAuthorize` and `@AuthenticationPrincipal` (spring-security-core). Its _After_ references
`Role`, `Status`, `NotPermittedException` and an `Order` constructor that no block defines — I
had to scaffold four types before `javac --release 21` accepted it (it compiles cleanly once
scaffolded). Either declare the real coordinates and add the missing types, or say the block is
an illustrative fragment. Example A's blocks compile as printed (subject to M3).

### m2. `password-storage.md:69-71` — `upgradeEncoding` does not do what is claimed for PBKDF2

"It is how a cost increase, an algorithm change and a pepper rotation all get applied without a
migration job." `Argon2PasswordEncoder`, `BCryptPasswordEncoder`, `SCryptPasswordEncoder` and
`DelegatingPasswordEncoder` override `upgradeEncodingNonNull`; **`Pbkdf2PasswordEncoder` does
not** (verified by grep over the 7.1.1 sources), so it inherits the `false` default — neither an
iteration raise nor a pepper rotation will ever trigger a rehash there. Add: "except
`Pbkdf2PasswordEncoder`, which does not override it — with PBKDF2 the rehash decision is yours
to write." The algorithm-change claim is correct (`DelegatingPasswordEncoder` returns true when
the stored `{id}` differs from `idForEncode` — read at line 267).

### m3. `password-storage.md:97-100` — the `DelegatingPasswordEncoder` id list reads as complete and is not

`PasswordEncoderFactories.createDelegatingPasswordEncoder()` in 7.1.1 also registers `ldap`,
`MD4`, `MD5`, `SHA-1` and `SHA-256`. Either add them or write "the ids that matter are …". The
`idForEncode = "bcrypt"` claim is verified — confirmed both in source and at runtime
(`{bcrypt}$2a$…`).

### m4. `password-storage.md:42-44` — the "~125 parallel instances" arithmetic does not check out

8 GiB ÷ 46 MiB ≈ **178**, not ~125. (125 corresponds to a ~64 MiB parameterisation.) The
qualitative argument is sound and is the crux of the section, so fix the number rather than the
paragraph: either say ~175 at 46 MiB, or state the memory figure the 125 came from.

### m5. Facts stated three times across body and references

Against the house gate "No file duplicates content that already exists elsewhere in the skill":

- Argon2 16384-vs-19456 + `new Argon2PasswordEncoder(16, 32, 1, 19456, 2)` —
  `SKILL.md:51-59`, `password-storage.md:72-77`, `before-after.md:113-115`.
- The 72-byte rule with both ASVS numbers — `SKILL.md:105-107`, `password-storage.md:89-93`,
  `review.md:26-28` (all three carry B1, so they must be edited together anyway).
- The NIST-vs-ASVS length conflict and the "NIST relaxed the rules" trap — `SKILL.md:96-104`
  ≈ `password-policy.md:69-96`.

The body needs the _claim_; the reference should hold the _source and the numbers_. Reduce each
body copy to the one-line judgement plus the pointer.

### m6. `password-storage.md:55` — provenance line names the wrong tree

"(7.1.1, verified against `spring-projects/spring-security@main`)". `main` currently ships
7.2.0-M1, so it is not 7.1.1. Every value in that section does match the 7.1.1 sources jar (I
checked), so this is a citation defect, not a data defect: write "verified against the
`spring-security-crypto:7.1.1` sources jar".

---

## NIT

- **n1.** `before-after.md:114` — "verification measured at ~40 ms on the target host" is an
  invented measurement in a skill that otherwise demands every number carry a date and a source.
  Measured here: 17.0 ms/op encode, 14.5 ms/op matches at `m=19456, t=2, p=1` (JDK 25, Temurin).
  Make it a placeholder (`measured at <N> ms — fill this in`), which also models the practice the
  section is teaching.
- **n2.** `before-after.md:14` — "The code below is from the authors' own published repository".
  It is lightly reformatted (`final class`, `secureRandom` → `SECURE_RANDOM`, added comments).
  Say "lightly reformatted". The substance is exact — see the Twootr verification below.
- **n3.** Body is **111 lines** (`SKILL.md:23-133`), 110 counting from the `#` title — at or one
  over the 70–110 house limit. Workflow step 4 (`SKILL.md:64-67`) is the paragraph to cut: "use
  parameterised queries and output encoding" is default agent behaviour, and only the two
  cross-references earn their place. One line recovers the margin.
- **n4.** `SKILL.md:112` — "Two pieces of security **dogma**". The crypto wrapper is dogma;
  encrypting-what-should-be-hashed is a requirements failure, not a principle applied too hard.
  Reword the lead-in ("Two moves that make code worse and both appear in real review comments").
  Both counter-examples themselves are honest and specific — see the dogma check below.
- **n5.** Test prompts: **prompt 5** reuses the description's own token `CryptoUtils.hash(String)`
  almost verbatim, so it tests string matching rather than routing. Replace with: _"Three of our
  services each call `BCryptPasswordEncoder` directly. I want one `hash(String)` helper in our
  commons library so we can change algorithm in one place — how should I structure it?"_
  **Prompt 8** is an easy negative, not a near-miss: nothing in this skill's description matches
  "gadget chain" or "readObject", while the neighbour's names both. Replace with a genuinely
  mixed case: _"We keep API keys in a session object we cache in Redis with Java serialization —
  is that a problem?"_ (secrets ⇒ this skill, deserialisation ⇒ the neighbour; must route to the
  neighbour). Also add a negative for the out-of-repo boundary the body claims:
  _"How do I configure the filter chain so `/admin/**` requires ROLE_ADMIN and everything else is
  authenticated?"_ — must not trigger. Prompts 1–4, 6 and 7 are realistic and well-aimed.
- **n6.** `password-storage.md:171-175` — the environment-variable quote is verbatim but comes
  from the cheat sheet's _Containers & Orchestrators_ section (line 511 of the source), about
  Docker configuration. The generalisation the skill draws is supported by the quote's own
  wording; naming the section costs four words and pre-empts the obvious objection.

---

## What was checked and held

Recorded so the next iteration does not re-litigate it.

| Claim                                                                                                                                                                    | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new Argon2PasswordEncoder(16, 32, 1, 19456, 2)` — **parameter order** `(saltLength, hashLength, parallelism, memory, iterations)`, memory in **KiB** (`withMemoryAsKB`) | **Correct.** Source-verified in the 7.1.1 jar and confirmed at runtime: the encoder emits `$argon2id$v=19$m=19456,t=2,p=1$…`. Constructor is public and not deprecated. This was the highest-risk item; the skill gets it right.                                                                                                                                                                                                                                                                                                              |
| `defaultsForSpringSecurity_v5_8()` = `m=16384, t=2, p=1` and is below OWASP's `m=19456` at `t=2,p=1`                                                                     | Correct; runtime prefix `$argon2id$v=19$m=16384,t=2,p=1`. `defaultsForSpringSecurity_v5_2()` is the deprecated one.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Spring Security **7.1.1 exists** and is the current GA (7.2.0-M1 is a milestone)                                                                                         | Correct — Maven Central metadata, `lastUpdated 20260820`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `DelegatingPasswordEncoder.idForEncode` is `"bcrypt"` in 7.1.1                                                                                                           | Correct, in source and at runtime (`{bcrypt}$2a$…`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Pbkdf2PasswordEncoder`: 310,000 iterations, `PBKDF2WithHmacSHA256`, hash width 256, salt 16, `MessageDigest.isEqual`, first ctor arg `secret` **is a pepper**           | All correct. Pepper behaviour proved at runtime (same pepper matches, different pepper does not).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `BCryptPasswordEncoder` default strength 10; `BCryptVersion` = `$2A`,`$2Y`,`$2B`; malformed-hash warn message                                                            | All correct.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| OWASP Argon2id table (5 rows), scrypt rows, bcrypt "minimum of 10", PBKDF2 600,000 / 220,000                                                                             | All verbatim-correct against `master`. The `UNVERIFIED:` on the SHA-1 figure is honest — it is 1,400,000, and omitting it was the right call.                                                                                                                                                                                                                                                                                                                                                                                                 |
| NIST SP 800-63B-4, **26 Aug 2025**, §3.1.1.2; 15-char SHALL single-factor, 8 within MFA; SHALL NOT composition/rotation; salt ≥32 bits; "memorized secret" gone          | All correct, verbatim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ASVS 5.0 §§ **6.2.1, 6.2.4, 6.2.5, 6.2.8, 6.2.9, 6.2.10, 6.2.12, 11.2.4, 11.4.2, 11.4.4, 11.5.1**                                                                        | Every number maps to the requirement the skill attributes to it. (11.5.1 carries one more sentence — M1.)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `MessageDigest.isEqual`                                                                                                                                                  | The Java 21 javadoc's implementation note is quoted exactly, and the skill is careful to say what it does **not** promise (timing depends on `digesta.length`). It never claims the javadoc says "constant-time". Accurate.                                                                                                                                                                                                                                                                                                                   |
| **The Twootr claim**                                                                                                                                                     | **Verified against the authors' repository.** `chapter_06/Twootr.java` contains `return Arrays.equals(hashedPassword, userOfSameId.getPassword());`, and `KeyGenerator.java` matches the quoted constants (`SCRYPT_COST=16384, BLOCK=8, PARALLELISM=1, KEY_LENGTH=20, SALT=16`, `password.getBytes(UTF_16)`). `"ab".getBytes(UTF_16)` returns `[-2,-1,0,97,0,98]` — the BOM and doubled length claims are both true. No misattribution.                                                                                                       |
| `UNVERIFIED:` handling                                                                                                                                                   | Four markers present (`password-storage.md:30,110,115`; `password-policy.md:99`), matching the author's report, and each sits on something genuinely unread. **No `*Password4j*` or password4j API appears in any code block** — all six mentions are prose. The one place confident prose outran the evidence is the _version_ attribution the markers do not cover (M2).                                                                                                                                                                    |
| Scope hygiene                                                                                                                                                            | All four named neighbours (`java-defensive-programming`, `structured-logging`, `java-strings-and-text`, `java-serialization-hardening`) exist in `skills/`, as do the `skill.yaml` dependencies. Read their `SKILL.md`s: **no contradiction**, and no duplication beyond a legitimate adversarial re-framing (`review.md:19` normalise-then-validate vs defensive-programming's "input normalisation at the edge"). The `spring-security-for-apis` exclusion is handled honestly in the body prose rather than smuggled into the frontmatter. |
| Dogma check                                                                                                                                                              | **Honest, not strawmen.** "Encrypt so we can support password recovery" is a real legacy review comment; the `CryptoUtils.hash(String)` critique is sharper than the usual "don't implement AES" — a signature too narrow for Argon2's parameters that discards the `{id}` prefix, i.e. it destroys the migration path it was built for. A competent reviewer would recognise both. (See n4 on the "dogma" label.)                                                                                                                            |
| House style                                                                                                                                                              | Sections in house order (`Purpose → Scope → Workflow → Decision rules → Rules → References`), second person, no persona, no marketing. All four references routed by explicit condition. Every rule is checkable on a diff. Body length and one weak paragraph: n3.                                                                                                                                                                                                                                                                           |
| Internal consistency                                                                                                                                                     | No number is stated twice with different values. 16384 / 19456 / 310,000 / 600,000 / strength 10 / 72 / 15 / 8 are consistent across all five files. The inconsistencies found are duplication (m5) and provenance (m6), not divergence.                                                                                                                                                                                                                                                                                                      |
| Java samples                                                                                                                                                             | `KeyGenerator` (Before, example A) and `PasswordVerifier` (After, example A) compile with `javac --release 21` against the real jars; `PasswordVerifier` also runs, and its `upgradeEncoding` path returns `true` for a `m=16384` hash under the `m=19456` encoder, as the prose claims. Example B compiles after scaffolding (m1). The Before in example A demonstrably exhibits the claimed flaw: `Arrays.equals` short-circuits on the first differing byte.                                                                               |

---

## Required to clear the gate

1. Rewrite B1 in all three locations (`SKILL.md:105-107`, `password-storage.md:89-93`,
   `review.md:26-28`), and correct the brief so the error is not re-inherited.
2. Fix M1 (ASVS 11.5.1's UUID sentence) in `review.md:38` and `password-storage.md:164-166`.
3. Fix M2 (`password-storage.md:105-112`, `password-policy.md:98`).
4. Fix M3 (`password-storage.md:57-58`, `before-after.md:3-5`).

The MINORs and NITs are worth taking in the same pass — m5 and n3 together buy back the line
budget that the B1 and M2 rewrites will spend.

---

# Iteration 2 — full gate re-run

Re-validated 2026-08-27, same validator. Treated as a fresh gate, not a spot-check: every claim
below was re-read from the files and re-checked against primary sources, and every executable
claim was run again.

**Gate result: PASS.** Zero BLOCKER, zero MAJOR. Remaining: **2 MINOR, 3 NIT**, plus one
adjudication (m5) and one judgement call (ASVS 11.5.1), both settled below.

Iteration 1's BLOCKER and all three MAJORs are **closed and verified closed**. Of the six
MINORs, five are closed; m5 was declined with an argument, and I have ruled on it. All six NITs
are closed.

---

## A. Verification of the fixes

### B1 — bcrypt mechanism: closed, all three consequences executed

`SKILL.md:102-107`, `password-storage.md:99-131`, `review.md:25-31` now describe the guard.
Every element checked against the 7.1.1 sources jar and run on JDK 25:

| Claim                                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encode` throws above 72 **bytes**                                                     | `encode THROWS: password cannot be more than 72 bytes`                                                                                                                                                                                                                                                                                                                    |
| `matches` deliberately skips the guard                                                 | `matches(72-byte prefix + 28 more, hash-of-prefix) = true` — login still succeeds                                                                                                                                                                                                                                                                                         |
| Re-encode throws for a legacy over-length user                                         | same user: `upgradeEncoding = false`, `encode(longPw)` **throws** — a verifiable lockout from password change and from any rehash                                                                                                                                                                                                                                         |
| The 72-**byte** vs 64-**character** trap (`password-storage.md:117-120`)               | `"e-acute".repeat(64)` = 64 chars, **128 bytes**, `encode` throws. The new sentence is correct, and is a better finding than the one it replaced.                                                                                                                                                                                                                         |
| Fixed versions **6.3.8 / 6.4.4** (OSS) plus 5.7.16 / 5.8.18 / 6.0.16 / 6.1.14 / 6.2.10 | Matches the advisory exactly.                                                                                                                                                                                                                                                                                                                                             |
| Attribution to **CVE-2025-22228**, March 2025                                          | Advisory published **19 March 2025**; title "BCryptPasswordEncoder does not enforce maximum password length"; description "BCryptPasswordEncoder.matches(CharSequence,String) will incorrectly return true for passwords larger than 72 characters as long as the first 72 characters are the same". The skill's paraphrase at `password-storage.md:110-111` is faithful. |

The reversal is flagged honestly in place — "This is the opposite of what most write-ups (and
this skill's own research brief, since corrected) claim" — and the brief **has** been corrected:
`research-brief.md:435-449` carries the struck-through original beside the fix, so the claim of
correction is true rather than decorative. The sentence "on versions predating the fix the
classic silent-truncation reading is correct — so date the claim before repeating it" is the
right way to keep the old knowledge without re-introducing the error.

### CVE-2025-22234 — new claim, verified accurate (one gap: n7)

`password-storage.md:133-136`, cross-referenced from `before-after.md:154-155`. Checked against
`spring.io/security/cve-2025-22234/`:

- The CVE number is real and is the right one.
- Advisory description: the CVE-2025-22228 fix "inadvertently broke the timing attack mitigation
  implemented in `DaoAuthenticationProvider`". The skill's "the same max-length fix introduced
  CVE-2025-22234, which broke `DaoAuthenticationProvider`'s timing mitigation and reintroduced a
  username-enumeration oracle" is a faithful characterisation, and "reintroduced" is correct
  because the mitigation predates the break.
- Severity MEDIUM, published 22 April 2025.
- The rhetorical use is sound rather than opportunistic: it is offered as evidence that the
  dummy-hash pattern in `before-after.md` guards against a regression the framework itself
  shipped, and `before-after.md:154` scopes it with "lost this mitigation **once**", which
  correctly implies it is fixed.

Not a BLOCKER, not a MAJOR.

### M1 — ASVS 11.5.1: honest reconciliation, accepted

You asked me to rule on whether this is genuine reconciliation or a softer suppression. It is
genuine. Four reasons — and I looked for the fourth specifically because I expected to find it
missing:

1. **The suppressed sentence is restored verbatim**, in `password-policy.md:58-61`, inside the
   requirement quote where an auditor-facing reader meets it: "Note that UUIDs do not respect
   this condition."
2. **The categorical instruction is gone.** "Do not raise it as a finding" has become a question
   the reviewer can actually answer — "Ask which applies before raising it" (`review.md:46`) —
   with a stated, checkable trigger: is ASVS L2 the bar?
3. **The distinction it draws is the one ASVS is drawing.** 122 bits against a 128-bit bar is a
   conformance gap, not a broken PRNG; `UUID.randomUUID()` really is version 4 from a CSPRNG
   (both re-verified — javadoc wording, and `version() == 4` at runtime). "Not a cryptographic
   weakness; it is a conformance one, and only sometimes" is precise, not evasive.
4. **The "What not to raise" list — the place the old text did the damage — now carries the
   exception inline** (`review.md:110-111`). A softer suppression would have left that list
   clean and buried the caveat in a reference. It did not.

Residual check for a hidden reversal: `password-storage.md:225-227` says to leave an _existing_
token alone "rather than spending a change on 6 bits" — scoped to existing code, while the
body's decision rule (`SKILL.md:88-89`) still defaults **new** unguessable values to
`SecureRandom`. The two are complementary, and iteration 1's tension between the decision rule
and the review guidance is resolved.

### M2 — the `@since` table: closed, re-verified from the jars

`password-storage.md:150-166` and `password-policy.md:100-104`, each row re-checked against the
7.1.1 sources jars:

| Claim                                                                                                                                      | Verified                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `HaveIBeenPwnedRestApiPasswordChecker` — spring-security-**web**, `org.springframework.security.web.authentication.password`, `@since` 6.3 | yes, exactly                                                                  |
| `CompromisedPasswordChecker` — spring-security-core, `org.springframework.security.authentication.password`, `@since` 6.3                  | yes, exactly                                                                  |
| `/.well-known/change-password` (`PasswordManagementConfigurer`) — spring-security-config, `@since` 5.6                                     | yes, exactly                                                                  |
| The five password4j encoders live in `org.springframework.security.crypto.password4j`                                                      | yes — all five present in the 7.1.1 jar                                       |
| …and are absent from the 6.5.11 jar                                                                                                        | yes — downloaded 6.5.11 and grepped: zero matches                             |
| "available since May 2024, on Boot 3.3"                                                                                                    | yes — Spring Security 6.3.0 GA was May 2024 and is Boot 3.3's managed version |

The heading "Older than most people think — do not make a version upgrade a prerequisite for
these" is the right framing, and the `UNVERIFIED:` marker was correctly narrowed to the
constructor signatures alone.

### M3 — executed, not assumed

I resolved exactly the four coordinates now stated at `before-after.md:5-11` — nothing else on
the classpath, no jspecify — compiled example A with `javac --release 21`, and ran it against a
seeded in-memory repository:

```
seeded: $argon2id$v=19$m=16384,t=2,p=1$...      (a hash written by the Spring default encoder)
   -> rehashed
login(absent)=false
login(present, correct)=true
login(present, wrong)=false
stored after login: $argon2id$v=19$m=19456,t=2,p=1$...
```

It compiles and runs. The `upgradeEncoding` path does what the prose claims: a legacy `m=16384`
hash is rewritten to `m=19456` on the next successful login.

I also ran the verification test the skill itself offers for this example ("Time the login
endpoint for a known-absent user and a known-present one. If the two differ by the cost of one
KDF run, the dummy hash is missing or in the wrong branch") — warmed up, with the stored
parameters matching the encoder:

```
absent  : 14.0 ms/op
present : 14.3 ms/op
```

The dummy-hash pattern demonstrably equalises the two paths. The skill's own verification test
passes on the skill's own code.

### m2 — `Pbkdf2PasswordEncoder`: closed and precise

`password-storage.md:76-80` and `:191-194`. Grepped `upgradeEncodingNonNull` across the 7.1.1
sources: overridden by `Argon2PasswordEncoder`, `BCryptPasswordEncoder`, `SCryptPasswordEncoder`
and `DelegatingPasswordEncoder`; **not** by `Pbkdf2PasswordEncoder` (nor
`MessageDigestPasswordEncoder`). The consequence drawn — "with PBKDF2 neither an iteration raise
nor a pepper rotation will ever trigger a rehash; that decision is yours to write" — is exactly
right, and the section 4 pepper bullet now closes the loop back to it.

### m4 — arithmetic: closed

`password-storage.md:43-45` now reads "roughly 175 concurrent instances on the same card
(8 GiB / 46 MiB = 178)". 8192 / 46 = 178.09; against the table's exact 47104 KiB,
8388608 / 47104 = 178.1. Correct, and showing the division makes it auditable.

### m1, m3, m6, n1, n2, n4, n5, n6 — all closed

- **m1** `before-after.md:13-16` declares example B an illustrative fragment and names the two
  Spring modules and the four elided types — exactly the four I had to scaffold.
- **m3** `password-storage.md:141-144` adds `ldap`, `MD4`, `MD5`, `SHA-1`, `SHA-256` with the
  correct gloss that they exist to _read_ legacy hashes, never to write new ones — true, since
  `idForEncode` is `bcrypt`.
- **m6** the section 3 heading now reads "verified against the `spring-security-crypto:7.1.1`
  sources jar" — correct provenance for what is actually there.
- **n1** the fabricated "~40 ms" is now `<N> ms/op on <host> — fill both in, and re-measure when
the hardware changes`, which teaches the practice instead of faking it.
- **n2** "lightly reformatted — `final class`, a renamed constant, added comments; every
  constant, call and argument is the authors'" — exactly the position the diff supports.
- **n4** "Two **moves** make code worse" — the mislabelling of a requirements failure as dogma
  is gone.
- **n5** test prompts 5 and 8 rewritten to drop the tokens shared with the description, and
  prompt 9 (the out-of-repo `spring-security-for-apis` boundary) added. `test-prompts.md` now
  has 5 positives and 4 negatives, with a note recording why 5 and 8 changed.
- **n6 (iteration 1)** the environment-variable quote is now attributed to the _Containers &
  Orchestrators_ section.

---

## B. Regression hunt

Every pointer, every renumbering, and every number stated more than once was re-checked.

**Routing pointers — all four correct after renumbering.** Workflow is now 1-5 (KDF parameters,
authorisation, input, secrets, verify). `password-storage.md` is routed "Read at step 1" — step 1
is the KDF step. `before-after.md` is routed "Steps 1, 2" — its two examples are password
verification and authorisation. `review.md` is routed "Read at step 5" — step 5 is the verify
step. `password-policy.md` is routed by condition, not by number. No pointer names a step that
no longer exists, and none points at the wrong one.

**The moved worked example landed intact and is not duplicated.** "minimum 12, one uppercase,
one digit, one symbol, expires every 90 days" and the `Password1!` / `Password2!` observation
each occur exactly once in the whole skill, in `password-policy.md:96-98`. The body keeps only
the judgement ("never write that NIST relaxed the password rules") and routes to the file. That
is the split the house rule wants.

**Numbers, end to end.** 16384, 19456, 310,000, 600,000, 47104 / 46 MiB, 72, 15 / 8, 122 / 128,
6.3.8, 6.4.4, 6.3, 5.6, 7.1.1, 1.85.2, 1.8.4 — every occurrence agrees with every other. No
number is stated twice with different values anywhere in the five files.

**Two things the compression cost.** Neither is factual; both are behaviour the body used to
carry and no longer does.

### R1 (MINOR) — the deleted Workflow step 1 was the skill's only threat-modelling instruction

`SKILL.md:44-46`. Iteration 1's step 1 read: "**Name the asset and the reachable attacker.** 'A
leaked backup' and 'another tenant's logged-in user' need different code; 'be more secure' needs
none." It is gone, and nothing replaced it.

That sentence did work nothing else does. It is what stops an agent generating generic hardening
for a vague request, and it is the distinction the rest of the skill silently depends on:
`password-storage.md:198-200` argues for peppering entirely on the strength of the
_database-only_ compromise scenario, which only that step teaches the reader to separate from a
full app-server compromise. The Scope paragraph covers a different case — a service with no
credential store at all — not this one.

Iteration 1's n3 named step 4 as the line to cut, not step 1.

**Edit:** restore it as a single line. The budget exists without exceeding 110 lines:
`SKILL.md:119-120` — "(A third, re-checking one invariant on every layer, belongs to
`java-defensive-programming`.)" — is the third copy of an exclusion already carried by the
frontmatter (`SKILL.md:17-18`) and by `review.md:117-118`. Delete that parenthesis and the line
is paid for.

### n6 (NIT) — new step 3 asserts a negative without its antecedent

`SKILL.md:63-65`: "**Allowlist attacker-controlled input as structure, but it is not the
control** — regex over hostile input is a DoS vector…". The clause naming what _is_ the control
("parameterised queries and output encoding stop injection") was compressed out.

I flag this only as a NIT, and with a caveat against myself: the author cut that clause because
iteration 1's n3 identified it as near-default agent behaviour, which it is. The residual defect
is rhetorical, not behavioural — the sentence denies a control it never names, which reads as an
unfinished thought. Three words fix it: "…but it is not the control — parameterised queries and
output encoding are." `review.md:71-74` still carries the full OWASP sentence, so nothing is lost
from the skill, only from the always-loaded body.

### n7 (MINOR) — CVE-2025-22234 is stated without versions

`password-storage.md:133-136` tells the reader the framework shipped a username-enumeration
oracle and gives them no way to check whether they are running it. The paragraph's own framing
("this skill's own subject arriving from the framework") invites exactly that check.

**Edit:** append the advisory's numbers — affected 6.4.4, 6.3.8 and the enterprise back-ports
(6.2.10, 6.1.14, 6.0.16, 5.8.18, 5.7.16), i.e. precisely the versions carrying the 22228 fix;
fixed in **6.4.5 / 6.3.9**, April 2025. Two clauses, and the paragraph becomes actionable.

### n8 (NIT) — two of the four stated coordinates are unversioned

`before-after.md:5-11` pins `spring-security-crypto:7.1.1` and `bcprov-jdk18on:1.85.2` but names
`org.springframework:spring-core` and `commons-logging:commons-logging` without versions. Under
a Boot BOM that is fine; for the standalone example the file describes, it is not resolvable. I
ran it with `spring-core:7.0.4` and `commons-logging:1.3.5`. Pin them, or say "versions from
your Boot BOM".

### n9 (NIT) — `review.md:23-24` should carry the PBKDF2 exception

Finding 5 — "Is there a rehash path? `rg 'upgradeEncoding'`. Without it, a cost increase or an
algorithm change reaches only new users, forever." — is now incomplete in the one place a
reviewer greps: with `Pbkdf2PasswordEncoder`, _finding_ `upgradeEncoding` is not sufficient
either. Add six words: "— and with `Pbkdf2PasswordEncoder` it never fires (`password-storage.md`
section 3)."

---

## C. The adjudication: m5, the Argon2 16384 / 19456 pair in three places

**Ruling: the comment stands. m5 is withdrawn, not deferred.**

The three sites are `SKILL.md:49-57` (the compliance table and the constructor call),
`password-storage.md:82-87` (the encoder-facts entry), and `before-after.md:126-129` (the
rationale comment on the code sample).

The author's argument is correct on the merits, and the rule does not reach this case:

1. **The house rule targets duplicated exposition, not a code sample's own rationale.** Its
   purpose is to stop two prose treatments of one fact drifting apart and forcing a reader to
   reconcile them. A comment stating "the default is 16384; OWASP's floor at t=2, p=1 is 19456"
   is not a treatment of the subject; it is the artefact under discussion carrying its own
   provenance.
2. **Stripping it would make the section contradict itself.** `password-storage.md` section 8
   and this very sample exist to teach "record the parameter, the date it was chosen and the
   measured verification time next to the encoder bean, because nothing else in the system makes
   a stale cost factor visible". A sample demonstrating that lesson with the rationale deleted
   would be a worked example of the failure it warns about.
3. **The three sites carry different loads.** Body: the compliance judgement ("the framework
   default is not a compliance claim"), which the commissioning brief requires to be visible in
   the body. Reference: the source-of-truth entry among the surrounding encoder facts. Sample:
   the in-situ artefact a reader copies into a codebase — the only one of the three that travels
   with the code.
4. **The maintenance exposure is bounded and already accepted.** If OWASP moves off 19456, three
   sites change; two of those three are mandated by the commissioning brief and by the
   encoder-facts section's purpose. The comment adds the third at negligible marginal cost.

One condition, which the current text already satisfies: the comment states _facts and a date_,
not the _argument_. It does not re-argue memory-hardness or re-cite ASVS. If it ever grows into
a paragraph, the rule bites. As written, it does not.

---

## D. Gate

| Severity | Iteration 1 | Iteration 2    |
| -------- | ----------- | -------------- |
| BLOCKER  | 1           | **0**          |
| MAJOR    | 3           | **0**          |
| MINOR    | 6           | 2 (R1, n7)     |
| NIT      | 6           | 3 (n6, n8, n9) |

**PASS.** Zero BLOCKER, zero MAJOR.

Nothing outstanding blocks shipping. R1 is the one I would take before merge — it restores a
line of behaviour the body lost, and the budget for it is identified. n7's two clauses are worth
the same pass. n6, n8 and n9 are polish.

The skill is now, as far as I can establish against primary sources, factually correct
throughout: every Spring Security fact matches the 7.1.1 sources jar, every OWASP / NIST / ASVS
figure and section number matches the upstream text, both CVEs match their advisories, the book
attribution matches the authors' repository, and example A compiles and runs — including its own
verification test — against exactly the coordinates it states.
