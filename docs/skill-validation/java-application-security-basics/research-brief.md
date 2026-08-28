# Research brief — `java-application-security-basics`

Researched 2026-08-27. All web sources fetched on that date. Anything not directly verified
against a primary source is marked `UNVERIFIED:`.

Scope of the proposed skill: application-level security in Java 21+ code — password storage,
validation at the trust boundary, authorisation at the domain boundary, secret handling, and
"never roll your own crypto". Not transport security, not framework configuration.

---

## 1. Canonical sources, with exact citations

### 1.1 OWASP Password Storage Cheat Sheet

Source: `https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Password_Storage_Cheat_Sheet.md`
(fetched 2026-08-27; the Cheat Sheet Series is continuously versioned from `master`, there is no
release number on the page — cite it by fetch date).

**Argon2id** — verbatim: _"Rather than a simple work factor like other algorithms, Argon2id has
three different parameters that can be configured: the base minimum of the minimum memory size
(m), the minimum number of iterations (t), and the degree of parallelism (p)."_

Recommended settings (each line an equivalent-security alternative):

| m              | t   | p   |
| -------------- | --- | --- |
| 47104 (46 MiB) | 1   | 1   |
| 19456 (19 MiB) | 2   | 1   |
| 12288 (12 MiB) | 3   | 1   |
| 9216 (9 MiB)   | 4   | 1   |
| 7168 (7 MiB)   | 5   | 1   |

**scrypt** — one of: `N=2^17 (128 MiB), r=8, p=1` / `N=2^16, r=8, p=2` / `N=2^15, r=8, p=3` /
`N=2^14, r=8, p=5` / `N=2^13, r=8, p=10`.

**bcrypt** — verbatim: _"The work factor should be as large as verification server performance
will allow, with a minimum of 10."_ And: _"bcrypt has a maximum length input length of 72 bytes
for most implementations, so you should enforce a maximum password length of 72 bytes (or less if
the bcrypt implementation in use has smaller limits)."_

**PBKDF2** — PBKDF2-HMAC-SHA256: **600,000** iterations; PBKDF2-HMAC-SHA512: **220,000**;
PBKDF2-HMAC-SHA1: **1,300,000–1,400,000**, legacy only.

**Peppering** — verbatim: _"A pepper is shared between stored passwords, rather than being unique
to an individual password like a password salt."_ / _"Unlike a password salt, the pepper should
not be public and should not be stored along with the generated hash. The pepper should be stored
separately from the password database."_ / _"Peppers are secrets and should be stored in 'secrets
vaults' or HSMs (Hardware Security Modules)."_ The recommended construction is
`bcrypt(base64(hmac-sha384(data:$password, key:$pepper)), $salt, $cost)` — note the base64, which
exists to defeat null-byte truncation, and the HMAC, which exists to defeat _password shucking_.

**Upgrading legacy hashes** — two sanctioned routes: expire inactive users' passwords, or "layer
the hashes" (e.g. `bcrypt(md5($password))`) and replace with a direct hash on next login.

### 1.2 OWASP Input Validation Cheat Sheet

Source: same repo, `Input_Validation_Cheat_Sheet.md`, fetched 2026-08-27.

- Denylists: _"it is trivial for an attacker to bypass such filters"_, and they _"frequently
  prevent authorized input, like `O'Brian`"_.
- Allowlists: _"Allowlist validation involves defining exactly what IS authorized, and by
  definition, everything else is not authorized."_
- Two layers: **syntactic** — _"enforce correct syntax of structured fields (e.g. SSN, date,
  currency symbol)"_; **semantic** — _"enforce correctness of their values in the specific business
  context (e.g. start date is before end date, price is within expected range)"_.
- Location: _"Input validation **must** be implemented on the server-side before any data is
  processed"_; client-side validation _"can be circumvented by an attacker who disables JavaScript
  or uses a web proxy"_. Recommended split: _"client-side JavaScript-based validation for UX and
  server-side validation for security"_.
- **The load-bearing sentence for this skill**: _"Input Validation should not be used as the
  primary method of preventing XSS, SQL Injection and other attacks."_ Parameterised queries and
  context-aware output encoding are the control; validation _"can significantly contribute to
  reducing their impact"_.
- Warns explicitly about **ReDoS** — _"RegEx Denial of Service (ReDoS) attacks"_ — for regex
  applied to untrusted input.

### 1.3 OWASP Secrets Management Cheat Sheet

Source: same repo, `Secrets_Management_Cheat_Sheet.md`, fetched 2026-08-27. Section headings:
Introduction; General Secrets Management; CI/CD; Cloud Providers; Containers & Orchestrators;
Implementation Guidance; Encryption; Detection; Incident Response; Multi-Cloud; Related.

- _"Many organizations have them hardcoded within the source code in plaintext, littered
  throughout configuration files and configuration management tools."_
- Lifecycle: _"Secrets follow a lifecycle. The stages of the lifecycle are as follows: Creation,
  Rotation, Revocation, Expiration"_.
- Rotation: _"You should regularly rotate secrets so that any stolen credentials will only work for
  a short time."_
- **Environment variables are discouraged**, verbatim: _"Environment variables are generally
  accessible to all processes and may be included in logs or system dumps. Using environment
  variables is therefore not recommended unless the other methods are not possible."_ Preferred:
  mounted volumes (file) or in-memory fetch from a secret store. _This contradicts the widespread
  12-factor habit of `SPRING_DATASOURCE_PASSWORD` in the environment — worth stating plainly._

### 1.4 OWASP ASVS 5.0.0 (published May 2025)

Sources: `ASVS/v5.0.0/5.0/en/0x15-V6-Authentication.md` and `0x20-V11-Cryptography.md`,
fetched 2026-08-27. ~350 requirements across 17 chapters (ASVS 4.0.3 had 286 across 14).

V6.2 Password Security:

- **6.2.1** _"Verify that user set passwords are at least 8 characters in length although a minimum
  of 15 characters is strongly recommended."_
- **6.2.4** _"Verify that passwords submitted during account registration or password change are
  checked against an available set of, at least, the top 3000 passwords which match the
  application's password policy, e.g. minimum length."_
- **6.2.5** _"Verify that passwords of any composition can be used, without rules limiting the type
  of characters permitted. There must be no requirement for a minimum number of upper or lower
  case characters, numbers, or special characters."_
- **6.2.8** _"Verify that the application verifies the user's password exactly as received from the
  user, without any modifications such as truncation or case transformation."_
- **6.2.9** _"Verify that passwords of at least 64 characters are permitted."_
- **6.2.10** _"Verify that a user's password stays valid until it is discovered to be compromised
  or the user rotates it. The application must not require periodic credential rotation."_
- **6.2.12** _"Verify that passwords submitted during account registration or password changes are
  checked against a set of breached passwords."_

V11 Cryptography — the storage requirement lives here, **not** in V6:

- **11.4.2** (L2) _"Verify that passwords are stored using an approved, computationally intensive,
  key derivation function (also known as a 'password hashing function'), with parameter settings
  configured based on current guidance."_
- **11.4.4** (L2) _"Verify that the application uses approved key derivation functions with key
  stretching parameters when deriving secret keys from passwords."_
- **11.5.1** (L2) _"Verify that all random numbers and strings which are intended to be
  non-guessable must be generated using a cryptographically secure pseudo-random number generator
  (CSPRNG) and have at least 128 bits of entropy."_
- **11.2.4** (L3) _"Verify that all cryptographic operations are constant-time, with no
  'short-circuit' operations in comparisons, calculations, or returns, to avoid leaking
  information."_

ASVS 5.0 does not name Argon2/bcrypt/PBKDF2 in requirement text; it defers to the Password Storage
Cheat Sheet. That is deliberate and is why the skill should cite the cheat sheet for parameters and
ASVS for the requirement.

### 1.5 NIST SP 800-63B — **Version 4, dated 26 August 2025**

Source: `https://pages.nist.gov/800-63-4/sp800-63b.html`, fetched 2026-08-27. Section **3.1.1.2
"Password Verifiers"** (rev 4 renamed "memorized secrets" to **"passwords"** — the old term is
gone; do not write "memorized secret" as though it were current text).

- **Length, and this is the surprise**: _"Verifiers and CSPs **SHALL** require passwords that are
  used as a single-factor authentication mechanism to be a minimum of 15 characters in length."_
  For passwords used as one factor within MFA: _"minimum of eight characters in length."_
- _"**SHOULD** permit a maximum password length of at least 64 characters."_
- _"**SHOULD** accept all printing ASCII characters and the space character."_ /
  _"**SHOULD** accept Unicode characters in passwords."_
- _"**SHALL NOT** impose other composition rules (e.g., requiring mixtures of different character
  types)."_
- _"**SHALL NOT** require subscribers to change passwords periodically."_
- Blocklist: _"**SHALL** compare the prospective secret against a blocklist"_ of commonly used,
  breached and context-specific values; _"entire password **SHALL** be subject to comparison, not
  substrings."_
- _"**SHALL NOT** permit the subscriber to store a hint ... accessible to an unauthenticated
  claimant."_
- Storage: _"**SHALL** be salted and hashed using a suitable password hashing scheme"_; _"salt
  **SHALL** be at least 32 bits in length"_.
- Pepper: _"**SHOULD** perform an additional iteration of a keyed hashing ... using a secret key
  known only to the verifier."_ That key _"**SHALL** be stored separately from the hashed
  passwords"_ and _"**SHOULD** be stored and used within a hardware-protected area."_

**Conflict to surface in the skill**: ASVS 5.0 6.2.1 sets the L1 floor at 8 with 15 "strongly
recommended"; NIST 800-63B-4 makes 15 a **SHALL** for single-factor. They are not the same bar.
A team that says "we follow NIST" and enforces 8 characters with no second factor is
non-compliant. The salt floor also differs: NIST says ≥32 bits, every modern KDF default is 128
bits — treat 32 bits as a legacy floor, not a target.

### 1.6 JDK javadoc (Java 21 API, `docs.oracle.com/en/java/javase/21`)

**`java.security.MessageDigest.isEqual`**

```java
public static boolean isEqual(byte[] digesta, byte[] digestb)
```

Implementation note, verbatim: _"All bytes in `digesta` are examined to determine equality. The
calculation time depends only on the length of `digesta`. It does not depend on the length of
`digestb` or the contents of `digesta` and `digestb`."_

Note carefully what this does **not** promise: the timing depends on `digesta.length`. It is
constant-time in the _contents_, not in the _length of the second argument_. For fixed-width
digests that is irrelevant; for variable-length secrets, length is still leaked. Also: it is a
byte-array API — there is no `String` overload, which is the whole point.

**`java.security.SecureRandom`**

```java
public static SecureRandom getInstanceStrong() throws NoSuchAlgorithmException   // @since 1.8
```

Class doc, verbatim: _"This class provides a cryptographically strong random number generator
(RNG). A cryptographically strong random number minimally complies with the statistical random
number generator tests specified in FIPS 140-2 ... section 4.9.1. Additionally, `SecureRandom` must
produce non-deterministic output."_

`getInstanceStrong()`, verbatim: _"Returns a `SecureRandom` object that was selected by using the
algorithms/providers specified in the `securerandom.strongAlgorithms` Security property. Some
situations require strong random values, such as when creating high-value/long-lived secrets like
RSA public/private keys."_ And: _"Every implementation of the Java platform is required to support
at least one strong `SecureRandom` implementation."_

Blocking caveat, verbatim: _"Note: Depending on the implementation, the `generateSeed`, `reseed`
and `nextBytes` methods may block as entropy is being gathered, for example, if the entropy source
is /dev/random on various Unix-like operating systems."_

Self-seeding, verbatim: _"A newly created PRNG `SecureRandom` object is not seeded (except if it is
created by `SecureRandom(byte[])`). The first call to `nextBytes` will force it to seed itself from
an implementation-specific entropy source. This self-seeding will not occur if `setSeed` was
previously called."_

`setSeed`, verbatim: _"Reseeds this random object with the given seed. The seed supplements, rather
than replaces, the existing seed."_ — so `new SecureRandom(seed)` is not a way to make it
deterministic, and code that tries to is confused about what it is doing.

**Practical rule the skill should state**: `new SecureRandom()` is correct for salts, session ids
and CSRF tokens. `getInstanceStrong()` is for long-lived keys, and on a container with a thin
entropy pool it can block at startup — a real, observed production hang. Do not reach for it
reflexively.

**`javax.crypto.spec.PBEKeySpec`**

```java
public PBEKeySpec(char[] password)
public PBEKeySpec(char[] password, byte[] salt, int iterationCount)
public PBEKeySpec(char[] password, byte[] salt, int iterationCount, int keyLength)
public final void clearPassword()
```

Class javadoc, verbatim — this is the JDK's own statement of the `char[]` rationale, and the best
citation for it: _"Also note that this class stores passwords as char arrays instead of `String`
objects (which would seem more logical), because the String class is immutable and there is no way
to overwrite its internal value when the password stored in it is no longer needed. Hence, this
class requests the password as a char array, so it can be overwritten when done."_

### 1.7 Effective Java, 3rd edition (Bloch, 2018) — items that actually apply

- **Item 75, "Include failure-capture information in detail messages"** — the item that most
  directly governs error handling around secrets. Bloch advises _not_ to include passwords,
  encryption keys and the like in detail messages, because stack traces are seen by many people.
  This is the citation for "do not put `e.getMessage()` in an HTTP body" and for "do not log the
  token".
- **Item 50, "Make defensive copies when needed"** — the byte-array salt/hash returned from a
  `User` getter is exactly this. See §4 and the Twootr example.
- **Item 17, "Minimize mutability"** and **Item 15, "Minimize the accessibility of classes and
  members"** — the structural argument for keeping the hash inside the aggregate rather than
  exposing it.
- **Item 85, "Prefer alternatives to Java serialization"** and **Item 88, "Write `readObject`
  methods defensively"** — relevant but **owned by `java-serialization-hardening`**; reference,
  do not restate.
- **Item 10 (`equals` contract)** — indirectly: a domain type whose `equals` compares a secret is
  both a timing leak and a `hashCode` hazard.

### 1.8 Urma & Warburton, _Real-World Software Development_ (O'Reilly, 2019), chapter 6 "Twootr"

Chapter 6 builds the Twootr messaging system and contains a section titled "Passwords and
Security". Code verified directly against the authors' repository
`https://github.com/Iteratr-Learning/Real-World-Software-Development`,
`src/main/java/com/iteratrlearning/shu_book/chapter_06/`, cloned 2026-08-27.

What the chapter actually does, verbatim from `KeyGenerator.java`:

```java
class KeyGenerator {
    private static final int SCRYPT_COST = 16384;
    private static final int SCRYPT_BLOCK_SIZE = 8;
    private static final int SCRYPT_PARALLELISM = 1;
    private static final int KEY_LENGTH = 20;
    private static final int SALT_LENGTH = 16;

    private static final SecureRandom secureRandom = new SecureRandom();

    static byte[] hash(final String password, final byte[] salt) {
        final byte[] passwordBytes = password.getBytes(UTF_16);
        return SCrypt.generate(passwordBytes, salt, SCRYPT_COST,
            SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELISM, KEY_LENGTH);
    }

    static byte[] newSalt() {
        final byte[] salt = new byte[SALT_LENGTH];
        secureRandom.nextBytes(salt);
        return salt;
    }
}
```

And from `Twootr.java`:

```java
var hashedPassword = KeyGenerator.hash(password, userOfSameId.getSalt());
return Arrays.equals(hashedPassword, userOfSameId.getPassword());
```

**Still current (the design reasoning):** using an established memory-hard KDF from a real library
(BouncyCastle scrypt) rather than a hand-rolled hash; a per-user 16-byte salt from `SecureRandom`;
storing salt alongside the hash; keeping the KDF behind a single named collaborator so the
parameters live in one place; and the book's framing that this is a _design_ decision, not a
library call.

**Now outdated, precisely:**

1. `SCRYPT_COST = 16384` is `N=2^14`. The current OWASP table pairs `N=2^14` with **`p=5`**; the
   book uses `p=1`. It is below every line of the 2026 table. (In 2019 it matched then-current
   guidance — this is drift, not an error the authors made.)
2. `KEY_LENGTH = 20` (160 bits). Modern defaults are 256 bits (Spring Security's Argon2 and PBKDF2
   encoders both use 32 bytes / 256 bits).
3. `Arrays.equals(hashedPassword, ...)` is a **short-circuiting, non-constant-time comparison**.
   The correct call is `MessageDigest.isEqual(...)`. This is the single most instructive line in
   the chapter for a 2026 reader — a book that gets the KDF right and the comparison wrong is the
   perfect illustration that "used a good library" is not the same as "did it correctly".
4. `String password` throughout, and `password.getBytes(UTF_16)`. UTF-16 is a strange choice
   (doubles the byte length of ASCII passwords, and `getBytes(UTF_16)` emits a BOM); UTF-8 is
   conventional and is what every modern encoder uses.
5. `User` exposes `byte[] getPassword()` and `byte[] getSalt()` — mutable arrays handed out of the
   aggregate (Effective Java Item 50), and it means the verification decision lives in `Twootr`
   rather than in `User`. Compare §4's "authorisation in the controller" failure: the same shape.
6. scrypt itself: OWASP now leads with Argon2id and lists scrypt as the fallback _"if Argon2id is
   not available"_.

The chapter is genuinely worth citing — it is one of the few mainstream Java books that treats
password storage as a design problem — but every numeric parameter and the comparison call must be
corrected before use.

---

## 2. Verified API reality

Versions verified 2026-08-27.

### Spring Security

Current: **7.1.1** (also supported: 7.0.7, 6.5.11). 7.0.0 GA was 17 November 2025.

```xml
<dependency>
  <groupId>org.springframework.security</groupId>
  <artifactId>spring-security-crypto</artifactId>
  <version>7.1.1</version>
</dependency>
```

`spring-security-crypto` is standalone — it has no Spring context dependency and can be used from
plain Java. Worth saying: you do not need Spring Security the framework to use `PasswordEncoder`.

**`org.springframework.security.crypto.password.PasswordEncoder`** (7.1.1):

```java
public interface PasswordEncoder {
    @Nullable String encode(@Nullable CharSequence rawPassword);
    boolean matches(@Nullable CharSequence rawPassword, @Nullable String encodedPassword);
    default boolean upgradeEncoding(@Nullable String encodedPassword);   // default: false
}
```

`upgradeEncoding` is the sanctioned rehash-on-login hook and is widely unknown — good skill
material. `matches` javadoc: _"The stored password itself is never decoded. Never true if either
rawPassword or encodedPassword is null or an empty String."_

**`org.springframework.security.crypto.argon2.Argon2PasswordEncoder`** — source verified at
`spring-projects/spring-security@main`:

```java
public class Argon2PasswordEncoder extends AbstractValidatingPasswordEncoder implements PasswordEncoder

private static final int DEFAULT_SALT_LENGTH = 16;
private static final int DEFAULT_HASH_LENGTH = 32;
private static final int DEFAULT_PARALLELISM = 1;
private static final int DEFAULT_MEMORY     = 1 << 14;   // 16384 KiB = 16 MiB
private static final int DEFAULT_ITERATIONS = 2;

public Argon2PasswordEncoder(int saltLength, int hashLength, int parallelism, int memory, int iterations)

@Deprecated
public static Argon2PasswordEncoder defaultsForSpringSecurity_v5_2()  // new Argon2PasswordEncoder(16, 32, 1, 1 << 12, 3)
public static Argon2PasswordEncoder defaultsForSpringSecurity_v5_8()  // 16, 32, 1, 1 << 14, 2
```

`matches` uses an internal `constantTimeArrayEquals` (`result |= expected[i] ^ actual[i]`), so the
comparison is correct. Requires BouncyCastle on the classpath. Class javadoc carries a candid
caveat, verbatim: _"The currently implementation uses Bouncy castle which does not exploit
parallelism/optimizations that password crackers will, so there is an unnecessary asymmetry between
attacker and defender."_

> **Finding worth leading with.** `defaultsForSpringSecurity_v5_8()` is `m=16384 KiB, t=2, p=1`.
> The OWASP minimum for `t=2, p=1` is `m=19456 KiB`. **Spring Security's recommended Argon2 default
> is below current OWASP guidance** — 16 MiB against 19 MiB. Not catastrophic, but it means
> "I used the Spring default" is not "I followed OWASP", and a skill that says so is earning its
> keep. `new Argon2PasswordEncoder(16, 32, 1, 19456, 2)` closes it.

**`Pbkdf2PasswordEncoder`** (`org.springframework.security.crypto.password`):

```java
private static final int DEFAULT_SALT_LENGTH = 16;
private static final SecretKeyFactoryAlgorithm DEFAULT_ALGORITHM =
        SecretKeyFactoryAlgorithm.PBKDF2WithHmacSHA256;
private static final int DEFAULT_HASH_WIDTH = 256;
private static final int DEFAULT_ITERATIONS = 310000;

public Pbkdf2PasswordEncoder(CharSequence secret, int saltLength, int iterations,
                             SecretKeyFactoryAlgorithm secretKeyFactoryAlgorithm)

public static Pbkdf2PasswordEncoder defaultsForSpringSecurity_v5_5()  // ("", 8, 185000, 256) — SHA-1
public static Pbkdf2PasswordEncoder defaultsForSpringSecurity_v5_8()  // ("", 16, 310000, PBKDF2WithHmacSHA256)
```

`matches` uses `MessageDigest.isEqual(...)` — correct.

> **Second finding.** The `secret` constructor parameter **is a pepper**, and it is the only
> first-party pepper support in Spring Security. Most teams do not know it exists.
>
> **Third finding.** 310,000 iterations against OWASP's current **600,000** for
> PBKDF2-HMAC-SHA256 — the Spring default is roughly half current guidance. Again: default ≠
> compliant.

**`BCryptPasswordEncoder`** (`org.springframework.security.crypto.bcrypt`):

```java
public BCryptPasswordEncoder()                                   // strength 10
public BCryptPasswordEncoder(int strength)
public BCryptPasswordEncoder(BCryptVersion version)
public BCryptPasswordEncoder(BCryptVersion version, @Nullable SecureRandom random)
public BCryptPasswordEncoder(int strength, @Nullable SecureRandom random)
public BCryptPasswordEncoder(BCryptVersion version, int strength, @Nullable SecureRandom random)

public enum BCryptVersion { $2A("$2a"), $2Y("$2y"), $2B("$2b") }
```

Default strength 10 = the OWASP _minimum_, with no headroom. `matches` on a malformed stored hash
logs `"Encoded password does not look like BCrypt"` and returns false.

> **CORRECTED ON VALIDATION, 2026-08-27 (iteration 1, BLOCKER B1). The claim below was wrong.**
> It was researched from secondary write-ups and not verified against the jar. The validator read
> `spring-security-crypto-7.1.1-sources.jar` and reproduced the behaviour at runtime.
>
> ~~**Verified gap: Spring Security does not enforce or warn about bcrypt's 72-byte input
> limit.** The encoder calls `BCrypt.hashpw(rawPassword.toString(), salt)` with no length check,
> so a 200-character passphrase is silently truncated at 72 bytes and characters 73+ contribute
> nothing.~~
>
> **What is actually true.** `BCrypt.hashpw(byte[], String, boolean)` contains:
>
> ```java
> // Enforce max length for new passwords only
> if (!for_check && passwordb.length > 72) {
>     throw new IllegalArgumentException("password cannot be more than 72 bytes");
> }
> ```
>
> That guard is the fix for **CVE-2025-22228** (`BCryptPasswordEncoder.matches` returned true for
> any two passwords over 72 characters sharing a 72-character prefix). It shipped in OSS 6.3.8 /
> 6.4.4 and enterprise 5.7.16 / 5.8.18 / 6.0.16 / 6.1.14 / 6.2.10 — every supported line since
> March 2025, and certainly 7.1.1. So:
>
> - `encode()` **throws** above 72 bytes; the symptom is a 500 at registration, loud not silent.
> - `matches()` still skips the guard (`for_check == true`), so legacy hashes keep the truncating
>   comparison — that is where the ASVS 6.2.8 violation actually lives.
> - Any re-encode of an over-length password (password change, or a rehash under
>   `upgradeEncoding`) now throws for that user, who must reset.
> - The silent-truncation reading is correct only for versions predating the fix.
> - Related, and worth carrying forward: the same fix introduced **CVE-2025-22234**, which broke
>   `DaoAuthenticationProvider`'s timing mitigation and reintroduced username enumeration.
>
> The remediation is unchanged: enforce max 72 _bytes_ (not chars) at registration, or use
> Argon2id. The ASVS 6.2.9 / 6.2.8 framing survives; the mechanism does not.

**`DelegatingPasswordEncoder`** and the `{id}` format — verified against
`docs.spring.io/spring-security/reference/features/authentication/password-storage.html` (7.1.1):

Storage format is `{id}encodedPassword`, e.g.
`{bcrypt}$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG`. The id _"must be at the
beginning of the password, start with `{` and end with `}`"_.

```java
PasswordEncoder passwordEncoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
```

Registered ids in the factory map: `bcrypt`, `noop`, `pbkdf2`, `pbkdf2@SpringSecurity_v5_8`,
`scrypt`, `scrypt@SpringSecurity_v5_8`, `argon2`, `argon2@SpringSecurity_v5_8`, `sha256`.
**`idForEncode` is `"bcrypt"`** — that is the current default in 7.1.1, _not_ Argon2id. A team that
believes "Spring defaults to the OWASP-recommended algorithm" is wrong on two counts (algorithm and
parameters).

**Spring Security 7.0+ additions** (verified from the same reference doc):
`Argon2Password4jPasswordEncoder`, `BcryptPassword4jPasswordEncoder`,
`ScryptPassword4jPasswordEncoder`, `Pbkdf2Password4jPasswordEncoder`,
`BalloonHashingPassword4jPasswordEncoder` — first-party wrappers over password4j; and
`HaveIBeenPwnedRestApiPasswordChecker` for ASVS 6.2.12 / NIST blocklist compliance, plus
`/.well-known/change-password` support.
`UNVERIFIED:` the exact package and constructor signatures of the five `*Password4j*` encoders and
of `HaveIBeenPwnedRestApiPasswordChecker` — I confirmed the class names from the reference
documentation but did not read their javadoc or source. Verify before naming them in code.

### BouncyCastle

```xml
<dependency>
  <groupId>org.bouncycastle</groupId>
  <artifactId>bcprov-jdk18on</artifactId>
  <version>1.85.2</version>   <!-- latest on Maven Central, released 2026-08-07 -->
</dependency>
```

Verified from source at `bcgit/bc-java@main`:

```java
package org.bouncycastle.crypto.params;
public class Argon2Parameters {
    public static final int ARGON2_d = 0x00, ARGON2_i = 0x01, ARGON2_id = 0x02;
    public static final int ARGON2_VERSION_10 = 0x10, ARGON2_VERSION_13 = 0x13;
    public static class Builder {
        Builder withSalt(byte[] salt);
        Builder withSecret(byte[] secret);          // <-- Argon2's native pepper (key K)
        Builder withAdditional(byte[] additional);
        Builder withIterations(int iterations);
        Builder withMemoryAsKB(int memory);
        Builder withMemoryPowOfTwo(int memory);
        Builder withParallelism(int parallelism);
        Builder withVersion(int version);
        Argon2Parameters build();
    }
}

package org.bouncycastle.crypto.generators;
public class Argon2BytesGenerator {
    public void init(Argon2Parameters parameters);
    public int generateBytes(char[] password, byte[] out);
    public int generateBytes(char[] password, byte[] out, int outOff, int outLen);
    public int generateBytes(byte[] password, byte[] out);
    public int generateBytes(byte[] password, byte[] out, int outOff, int outLen);
}
```

Two things fall out of this and both are skill-worthy. First, `withSecret(byte[])` is Argon2's
**built-in** keyed-hash parameter — with Argon2 you do not need OWASP's HMAC pre-hash construction
to get a pepper; pass the key as the secret. Second, `generateBytes` accepts `char[]`, so the
`char[]` discipline survives all the way to the KDF here — whereas Spring Security's
`PasswordEncoder.encode(CharSequence)` does not accept `char[]` at all. (`CharBuffer.wrap(char[])`
_is_ a `CharSequence` and gets you most of the way, but every encoder implementation calls
`.toString()` internally, materialising an immutable `String`. Verified in
`BCryptPasswordEncoder`: `BCrypt.hashpw(rawPassword.toString(), salt)`.)

### password4j

```xml
<dependency>
  <groupId>com.password4j</groupId>
  <artifactId>password4j</artifactId>
  <version>1.8.4</version>
</dependency>
```

Apache-2.0, on Maven Central, supports Argon2/bcrypt/scrypt/PBKDF2/balloon hashing. `UNVERIFIED:`
the exact signature of `Argon2Function.getInstance(...)` and the `Password.hash(...).addSalt(...)
.addPepper(...).with(...)` fluent chain — the argument order and overloads were reported by search
results, not read from javadoc or source. Verify before writing example code against password4j.
It is the library Spring Security 7 chose to wrap, which is a reasonable signal.

### Jakarta Bean Validation

```xml
<dependency>
  <groupId>jakarta.validation</groupId>
  <artifactId>jakarta.validation-api</artifactId>
  <version>3.1.1</version>
</dependency>
<dependency>
  <groupId>org.hibernate.validator</groupId>
  <artifactId>hibernate-validator</artifactId>
  <version>9.0.1.Final</version>   <!-- 9.1.x also current; pulls in jakarta.validation-api 3.1.1 -->
</dependency>
```

Spec: **Jakarta Validation 3.1** (the spec dropped "Bean" from its name at 3.1 — it is "Jakarta
Validation", not "Jakarta Bean Validation", from 3.1 onward). Package root `jakarta.validation`.
In Spring Boot, prefer `spring-boot-starter-validation` and let the BOM pick versions.

### JEP 471 / 498 — status verified

- **JEP 471** (JDK 23): deprecated for removal all memory-access methods in `sun.misc.Unsafe`.
- **JEP 498** (JDK 24): prints a warning on use; `--sun-misc-unsafe-memory-access=warn` is the
  default in 24, `=allow` suppresses it.
- **JDK 25**: still deprecated for removal, not yet removed. Removal is "a future release".
- Replacements: `VarHandle` (JEP 193, JDK 9) and the FFM API (JEP 454, JDK 22).

Relevance to this topic is narrow and mostly negative — see §3.5.

---

## 3. Live disagreements

These are places where competent engineers disagree today. A skill that presents any of them as
settled will be wrong for half its readers.

### 3.1 Argon2id vs bcrypt, 2025–2026

- **OWASP's position is unambiguous**: Argon2id first, scrypt if Argon2id is unavailable, bcrypt for
  legacy systems, PBKDF2 where FIPS certification is required.
- **The practitioner counter-position**: bcrypt at cost ≥ 12 is not broken and there is no incident
  record of bcrypt-at-adequate-cost being the proximate cause of a breach. Migration has real cost
  and real risk. The consensus in the 2026 practitioner write-ups is that the bcrypt→Argon2id gap
  is _"about long-term direction than urgent migration"_.
- **The technical crux** is memory-hardness, and it is quantitative: bcrypt uses a fixed 4 KiB
  working set, so an 8 GiB GPU parallelises it massively; Argon2id at 46 MiB permits roughly
  **~125** parallel instances on the same card. That is the whole argument.
- **The honest position for a skill**: greenfield → Argon2id with OWASP parameters. Existing bcrypt
  at cost ≥ 12 → not an incident; migrate opportunistically via `DelegatingPasswordEncoder` +
  `upgradeEncoding` on next login, do not schedule a project. Existing bcrypt at cost 10 (the
  Spring default) → raise the cost first; that is cheaper and buys more than a migration.
- **Complication specific to Java**: Spring Security's own javadoc admits its BouncyCastle-backed
  Argon2 _"does not exploit parallelism/optimizations that password crackers will"_. So on the JVM
  the defender's Argon2 is slower per unit of security than the attacker's. That partially erodes
  the theoretical advantage and is a legitimate reason a Java shop might stay on bcrypt. This
  nuance appears in essentially no blog post and is a strong reason for the skill to exist.

### 3.2 Peppering: yes/no, and where it lives

- **NIST 800-63B-4 says SHOULD** (keyed hash, key stored separately, ideally in an HSM). OWASP
  documents it but frames it as an optional additional layer.
- **Against**: it introduces a key-rotation problem with no clean answer; if the app server is
  compromised the pepper goes with the database in most real architectures, so the extra boundary
  is often illusory; a single known plaintext + salt + algorithm makes the pepper brute-forceable.
- **For**: it is the only control that helps in the specific, common scenario of a
  _database-only_ compromise — SQL injection, a leaked backup, a misconfigured replica.
- **Rotation is solvable** but nobody writes the code: verify with the current pepper, fall back to
  the previous one, rehash and store on success. Exactly what `upgradeEncoding` is for.
- **Where it lives is the sharper disagreement**: HSM (NIST's preference, rare in practice), a
  secrets manager (common), an environment variable (contradicted by the Secrets Management Cheat
  Sheet's own advice on environment variables), or the application config file (defeats the point
  entirely, since config and DB dumps usually leak together).
- **Java-specific mechanics** that most discussions get wrong: with Argon2, use
  `Argon2Parameters.Builder.withSecret(byte[])` — the native `K` parameter. With bcrypt you must
  use OWASP's `bcrypt(base64(hmac-sha384(pw, pepper)))` construction; the base64 is not decorative
  (null-byte truncation) and the HMAC is not interchangeable with a plain hash (password shucking).
  With PBKDF2 in Spring, use the `secret` constructor argument.

### 3.3 Validation in the domain constructor vs a validation layer

Genuinely unresolved, and the two camps are drawing on different sources.

- **Constructor/type camp**: make illegal states unrepresentable; an `EmailAddress` that exists is
  valid by construction; a validation layer is a separate thing that can be forgotten. Fits records
  and compact constructors well.
- **Validation-layer camp**: throwing from a constructor gives one error at a time, and a
  registration form needs _all_ the errors at once; Bean Validation gives you i18n messages, groups
  and a machine-readable violation set for free; a constructor throwing `IllegalArgumentException`
  produces a 500 unless someone remembers to map it.
- **The synthesis most experienced teams land on, and the position I would recommend the skill
  take**: they answer different questions. Bean Validation on the DTO answers _"is this request
  well-formed enough to reply 400 with a field-level list?"_ — collect-all, presentation-facing.
  The domain constructor answers _"can this object exist?"_ — fail-fast, non-negotiable, and it is
  what protects the second caller who never went through a controller. Doing both is not
  duplication _if the checks are different in kind_; it becomes duplication when the domain type
  re-implements `@Size(max=255)`.
- **This is the boundary with `java-defensive-programming`**, whose description already claims
  "input normalisation at the edge" and "when the same invariant is re-checked on every layer". The
  security skill must take only the _trust-boundary/attacker_ framing and defer the general
  layering question.

### 3.4 Allowlist vs denylist in practice

OWASP is categorical (allowlist). Practice is not, and the gap is where teams get hurt.

- Allowlisting works cleanly for structured fields (identifiers, postcodes, enums, dates) and
  breaks down for free text — you cannot allowlist a product description or a user's name. The
  `O'Brian` example in the cheat sheet is precisely this failure.
- Unicode makes "allowlist the alphabet" wrong for names in most of the world. `[a-zA-Z]` is a bug
  report waiting to happen.
- The defensible synthesis: allowlist _structure_ (length, charset class, format) and let the real
  control be contextual output encoding and parameterised queries. Denylisting is legitimate only
  as defence in depth, never as the control — which is what the cheat sheet's own "not the primary
  method" sentence is saying.
- **ReDoS is the trap in the allowlist advice itself**: the recommended remedy (validate with a
  regex) is a DoS vector when the pattern has nested quantifiers and the input is attacker-supplied.
  Java's `java.util.regex` is backtracking. This connects to `java-strings-and-text`, which already
  owns "catastrophic backtracking on untrusted input" — reference, don't restate.

### 3.5 Does `char[]` still buy anything, and is zeroing reliable?

The strongest case that it does not:

1. A moving/compacting collector (G1, ZGC, Shenandoah — i.e. every collector you will run on Java
   21+) may have copied the array any number of times before you zero it. `Arrays.fill(pw, '\0')`
   zeroes _one_ copy. The others are unreachable garbage that still contains the password.
2. The password almost certainly existed as a `String` before it reached you — HTTP parameter
   decoding, JSON deserialisation, JDBC. Jackson gives you a `String`. Zeroing your `char[]` after
   Jackson has already interned the value through the parse buffer is theatre.
3. Spring Security's `PasswordEncoder.encode(CharSequence)` calls `.toString()` internally
   (verified in `BCryptPasswordEncoder`), so the whole framework path is `String`-based regardless.
4. Java 21 has no supported mechanism to zero a `String`'s backing array. `sun.misc.Unsafe` was the
   old hack, and **JEP 471/498 close it** — deprecated for removal in JDK 23, warning by default in
   24, still present but doomed in 25. There is no `VarHandle` or FFM replacement for reaching into
   a heap `String`. So the "just Unsafe it" answer is now formally a dead end. That is the real
   relevance of JEP 471 here: not that zeroing broke, but that the last escape hatch is closing.

The case that it still buys something:

1. It shortens the window. Heap dumps and core dumps taken _after_ the credential is used are the
   realistic threat, and zeroing helps against exactly that.
2. It is a **type-level signal**. A `char[]` parameter tells every reader and every future
   maintainer "this is a secret, do not log it, do not put it in `toString()`, do not cache it".
   That is worth more in practice than the memory hygiene.
3. `String` participates in string deduplication, the constant pool and `toString()` of enclosing
   objects — a `char[]` in a record component will not accidentally appear in a log line the way a
   `String` will. (This overlaps `structured-logging`; frame it as a type-design consequence.)
4. The JDK's own APIs demand it: `PBEKeySpec(char[])`, `JPasswordField.getPassword()`,
   `Console.readPassword()`, `Argon2BytesGenerator.generateBytes(char[], byte[])`.

**Recommended skill position** — and this is a place where the skill can be genuinely more useful
than the internet: the memory-scrubbing argument for `char[]` is largely obsolete on a modern
collector and should not be presented as a security control. Keep `char[]` where the API requires
it and for its documentation value; do **not** contort an application to thread `char[]` through a
Spring stack that will `toString()` it anyway. Spend the effort instead on never putting the
credential in a field, a log, a `toString()` or an exception message — controls that actually hold.

---

## 4. Field failure modes

Each of these should be recognisable from a code snippet.

**Password storage**

1. `MessageDigest.getInstance("SHA-256")` used to hash a password. Fast by design; a modern GPU
   does billions per second. The name overlap with `MessageDigest.isEqual` (which _is_ the right
   call for comparison) makes this a genuinely confusing corner: same class, one method is right,
   one use is wrong.
2. Unsalted, or a single application-wide constant salt (which is a badly-implemented pepper, not a
   salt). Rainbow tables and the fact that identical passwords produce identical hashes.
3. `Arrays.equals` / `String.equals` on a hash or a token — short-circuits on first differing byte,
   leaking a byte-at-a-time oracle. **This is the exact bug in the Twootr book code (§1.8).**
   `MessageDigest.isEqual` is the fix.
4. Trusting `defaultsForSpringSecurity_v5_8()` as "OWASP compliant". Verified above: it is not, for
   Argon2 (16 vs 19 MiB) or PBKDF2 (310k vs 600k).
5. bcrypt's 72-byte ceiling versus a registration form advertising 128-character passphrases.
   **CORRECTED ON VALIDATION 2026-08-27:** ~~silently truncating… Spring Security does not
   check~~ — `encode` **throws** `IllegalArgumentException` since the CVE-2025-22228 fix
   (6.3.8 / 6.4.4); `matches` still skips the guard. See the corrected §2 above.
6. A cost factor chosen in 2018 and never revisited. There is no mechanism that makes this visible;
   nothing fails. Pair a cost constant with `upgradeEncoding` and a note of when it was last
   benchmarked.

**Randomness**

7. `new Random()` or `Math.random()` for a password-reset token, session id, API key or OTP.
   `java.util.Random` is a 48-bit LCG — observe two outputs, predict the rest.
   `ThreadLocalRandom` and `Random.from(RandomGenerator...)` are equally unsuitable. The Java 17+
   `RandomGenerator` interface makes this _worse_, because `SecureRandom` and `Xoshiro256PlusPlus`
   now share a supertype and look interchangeable at a call site.
8. `UUID.randomUUID()` used as a security token. This one is actually fine — it is specified to use
   a cryptographically strong PRNG and carries 122 bits of entropy, just under ASVS 11.5.1's 128.
   Worth stating explicitly because half the internet says it is unsafe (confusing it with UUID v1)
   and the other half uses `UUID.nameUUIDFromBytes` (v3/MD5, deterministic, genuinely unsafe).
9. `SecureRandom.getInstanceStrong()` on a request path or at startup in a container, blocking on
   `/dev/random`. Verified javadoc caveat. Reserve it for long-lived key generation.

**Authorisation**

10. `@PreAuthorize` on the controller only. A scheduled job, a message consumer, a GraphQL resolver
    or a second controller calls the same service method and the check is simply absent. The
    structural fix is to make the authorisation decision a precondition of the _domain operation_ —
    the operation takes the acting principal and refuses, rather than trusting that someone checked.
11. Authorisation by resource _type_ rather than resource _instance_ — "the caller has role
    CUSTOMER" without "…and this order belongs to that caller". IDOR/BOLA, still the most-exploited
    class of application flaw.
12. The check reads its subject from the request (`userId` in the path or body) rather than from
    the authenticated principal.
13. `findById(id).orElseThrow()` before the ownership check, with a different error for
    not-found and not-authorised — an enumeration oracle.

**Validation**

14. Bean Validation annotations on the DTO, and the domain entity constructible in an invalid state
    by any other path — a repository `save`, a test fixture, a Flyway-loaded row, a message handler.
    The DTO is not the trust boundary; the constructor is.
15. `@Valid` omitted on the `@RequestBody` parameter, so the annotations are decorative and
    nothing fails. Silent, and the code reads as validated.
16. Validation that _normalises_ (trims, lowercases, strips) and then a different layer validates the
    original. Check-then-use on two different values.

**Secrets**

17. `spring.datasource.password: hunter2` committed to `application.yml`. Rotation now means a
    deploy, and git history means the old value is permanent — rotating without purging history is
    not remediation.
18. A secret in an environment variable treated as sufficient. Contradicted by the Secrets
    Management Cheat Sheet verbatim (§1.3): visible in `/proc`, in `docker inspect`, in crash dumps
    and in child processes.
19. A key or token in a constant, in a test fixture, or in a comment "temporarily".
20. No detection: no `gitleaks`/`trufflehog`/secret scanning in CI, so #17–19 are found by an
    outsider.

**Leakage**

21. `e.getMessage()` returned in an HTTP body — Effective Java Item 75 says do not put secrets in
    detail messages; the corollary is do not put detail messages in responses. Leaks SQL, file
    paths, class names, internal hostnames. (Owned in part by `java-exception-design` and
    `rpc-and-api-contracts` — take only the leakage angle.)
22. A token, an `Authorization` header or a password logged at DEBUG "just while we debug this".
    (`structured-logging` owns redaction — reference it.)
23. A secret in `toString()` of a record or Lombok `@Data` class, which then reaches a log line via
    an entirely innocent `log.info("processing {}", request)`. Records generate `toString()` from
    every component — this is a concrete Java-21 hazard worth its own line.
24. A password or hash in a `hashCode`/`equals` pair, in a JPA entity that gets logged by
    Hibernate's SQL logger, or in an exception constructed with the offending value.

**Process**

25. "We'll add security later." The specific harm is not moral — it is that authorisation added
    late is added at the controller (the cheapest place to bolt it on), which is failure mode #10,
    permanently.

---

## 5. Before/after material

Two examples. Both target **Java 21**, both compile against stated coordinates.

### Example A — password verification

Compiles against `org.springframework.security:spring-security-crypto:7.1.1`
(+ `org.bouncycastle:bcprov-jdk18on:1.85.2` for Argon2), Java 21.

**Before — broken.** Four distinct defects, all common, in eight lines.

```java
public class UserService {
    public boolean login(String userId, String password) throws Exception {
        User user = repository.findById(userId).orElseThrow();
        MessageDigest md = MessageDigest.getInstance("SHA-256");   // 1: fast hash
        byte[] attempt = md.digest(password.getBytes());           // 2: no salt, default charset
        return Arrays.equals(attempt, user.getPasswordHash());     // 3: non-constant-time
    }                                                              // 4: user enumeration via orElseThrow
}
```

**After — correct.** The interesting move is not "use `PasswordEncoder`" — an agent does that
already. It is (a) overriding the Spring default up to OWASP's parameters, (b) `upgradeEncoding` as
the rehash path, and (c) doing the work even when the user does not exist, so timing does not
enumerate accounts.

```java
@Configuration
class PasswordConfig {
    // Spring's defaultsForSpringSecurity_v5_8() is m=16384; OWASP's floor for t=2,p=1 is 19456.
    @Bean PasswordEncoder passwordEncoder() {
        return new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
    }
}

class UserService {
    private static final String DUMMY_HASH =            // precomputed once, same parameters
        "$argon2id$v=19$m=19456,t=2,p=1$...";

    private final PasswordEncoder encoder;
    private final UserRepository repository;

    boolean login(String userId, String password) {
        Optional<User> user = repository.findById(userId);
        String stored = user.map(User::passwordHash).orElse(DUMMY_HASH);

        if (!encoder.matches(password, stored)) return false;      // constant work either way
        if (user.isEmpty()) return false;

        if (encoder.upgradeEncoding(stored)) {                     // rehash on successful login
            repository.updateHash(userId, encoder.encode(password));
        }
        return true;
    }
}
```

`encoder.matches` is internally constant-time (verified: `constantTimeArrayEquals`). The dummy-hash
trick is what stops the not-found path from returning in microseconds while the found path takes
150 ms.

### Example B — authorisation at the domain boundary

Compiles against Java 21 only (records, sealed types); `jakarta.validation-api:3.1.1` for the DTO
annotations if the controller half is shown.

**Before — the check lives in the controller.**

```java
@RestController
class OrderController {
    @PreAuthorize("hasRole('CUSTOMER')")
    @PostMapping("/orders/{id}/cancel")
    void cancel(@PathVariable String id, @AuthenticationPrincipal Principal p) {
        orderService.cancel(id);        // ownership never checked at all
    }
}

class OrderService {
    void cancel(String id) {            // any caller: scheduler, consumer, another controller
        orders.findById(id).orElseThrow().cancel();
    }
}
```

Two failures: role without instance ownership (#11), and a service method that trusts it was called
from the one place that checks (#10). The scheduled `CancelStaleOrdersJob` added six months later
calls `cancel(id)` and no check runs.

**After — the operation cannot be performed without presenting the actor.**

```java
public record Actor(String id, Set<Role> roles) {}

public final class Order {
    private final String id;
    private final String ownerId;
    private Status status;

    public void cancelBy(Actor actor) {
        if (!actor.id().equals(ownerId) && !actor.roles().contains(Role.SUPPORT)) {
            throw new NotPermittedException("cancel", id);      // no detail leaked
        }
        if (status != Status.PLACED) {
            throw new IllegalStateException("cannot cancel order in status " + status);
        }
        this.status = Status.CANCELLED;
    }
}
```

The signature is the control. There is no way to call `cancelBy` without an `Actor`, so the
scheduler must supply a system actor explicitly and the decision is auditable at one site. The
controller keeps `@PreAuthorize` as a cheap early rejection, but it is no longer the only check —
which is the entire point.

Trade-off to state honestly: `Actor` now threads through the domain API, and the domain has
acquired an authorisation concept. That is the price. It is worth paying for operations with
per-instance ownership rules; it is _not_ worth paying for a read of public reference data, and a
skill that demands it everywhere is §6.

---

## 6. Over-application counter-examples

Four, each a real pattern that makes code worse.

**6.1 The same invariant checked at every layer.** `@NotBlank @Size(max=100)` on the DTO,
`Objects.requireNonNull` + length check in the service, the same check in the domain constructor,
a `CHECK` constraint in the database, and a `@PrePersist` for good measure. Five places to change
when the limit becomes 200, four of which will be missed, and a reviewer can no longer tell which
one is authoritative. The rule that resolves it: **the boundary check and the invariant check are
different checks and both belong; the three copies in between do not.** Boundary answers "should I
reply 400 with a field list?"; invariant answers "can this object exist?". If a middle-layer check
would produce the same message as one of those two, delete it.

**6.2 Encrypting what only needs hashing.** A `password` column encrypted with AES-GCM "so we can
support the password-recovery feature". Now the plaintext is recoverable by anyone with the key,
the key is a new asset requiring rotation and an HSM, and the property that actually matters —
that a database dump does not yield passwords — has been thrown away in exchange for a feature
(emailing the user their password) that is itself a defect. The decision rule is one line:
**if you never need the plaintext back, hash it; if you do, you have a design problem before you
have a crypto problem.**

**6.3 The custom crypto wrapper "for flexibility".** `CryptoUtils.hash(String)` /
`SecurityHelper.encrypt(String)` wrapping a KDF "so we can swap algorithms later". What it
actually produces: a `String`-based API that discards the salt or hides it, an algorithm identifier
that is not stored with the hash (so you _cannot_ migrate — the exact flexibility it was built
for), a signature too narrow to express Argon2's parameters, and a code path that no reviewer
recognises as standard. `DelegatingPasswordEncoder`'s `{id}` prefix is the correct solution to that
requirement, and it already exists: the algorithm identity travels _with_ each stored hash, so two
algorithms coexist during migration. Note the shape of the mistake — it is not "wrote a cipher",
which nobody does. It is a wrapper that _loses information the standard format carries_. That is
the realistic form of "rolling your own crypto" in 2026, and it is worth saying so, because the
usual warning ("don't implement AES") is advice nobody needed.

**6.4 Composition rules and rotation.** "Minimum 12 characters, one uppercase, one digit, one
symbol, expires every 90 days." NIST 800-63B-4 **SHALL NOT** on both the composition rules and the
periodic rotation; ASVS 6.2.5 and 6.2.10 agree. The measured effect of composition rules is
`Password1!` and `Password2!`; the effect of rotation is predictable increments and reuse.

**But note the trap in the obvious version of this argument** — and this is a place where a skill
written from memory will be wrong. It is tempting to say "NIST relaxed password rules, so 12
characters is over-strict." It did not relax length. **800-63B-4 raised the single-factor
minimum to 15 characters (SHALL).** The correct statement is: drop the composition rules and the
expiry, _raise_ the length floor to 15 for single-factor, and add a breach-corpus check
(ASVS 6.2.12 / NIST blocklist). A rule of "12 with symbols" is simultaneously too permissive on
length and prohibited on composition. Getting this backwards is a live risk for any agent
summarising "NIST loosened password requirements" from pre-2024 memory.

---

## 7. Boundary check

`ls C:\git\agent-skills\skills` — **208 skills, none security-named.** `ls | grep -i
"secur\|crypt\|auth"` returns nothing. There is no existing application-security skill in this
repo; the topic is a genuine gap. Descriptions below were read from each `SKILL.md` frontmatter.

**Must not duplicate — name these in the exclusion:**

| Skill                                                                        | Owns                                                                                                                                                                                                                                        | Boundary this skill must respect                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `java-defensive-programming`                                                 | _"trust boundaries as the organising idea, preconditions with `Objects.requireNonNull`, fail-fast, input normalisation at the edge, `assert` for internal invariants"_; explicitly _"when the same invariant is re-checked on every layer"_ | **The sharpest overlap by far.** It already owns trust boundaries and layered re-validation as a _design_ topic. Take only the adversarial framing: allowlist vs denylist against a hostile input, ReDoS, validation as a non-substitute for parameterised queries, and the domain-constructible-in-invalid-state hole. Do **not** restate `requireNonNull` placement or the general layering argument. |
| `java-serialization-hardening`                                               | _"`readObject` is an extra constructor that accepts arbitrary bytes, gadget chains, JEP 290/415 filters, serialization proxy, Jackson polymorphic typing"_                                                                                  | Deserialisation attack surface entirely. Reference for "untrusted bytes"; write nothing about `readObject`, filters or gadget chains.                                                                                                                                                                                                                                                                   |
| `java-null-safety`                                                           | _"nullability as an API contract, JSpecify, where `Objects.requireNonNull` belongs, boundaries where null leaks in"_                                                                                                                        | Null as a semantic problem. No overlap if this skill avoids null-checking advice entirely.                                                                                                                                                                                                                                                                                                              |
| `rpc-and-api-contracts`                                                      | _"an error surface a machine caller can act on (stable codes, retryable flag, RFC 9457)"_                                                                                                                                                   | The _shape_ of the error contract. This skill may say "do not leak internals in the error body"; it must not design the error format.                                                                                                                                                                                                                                                                   |
| `structured-logging`                                                         | _"redaction at the encoder rather than at each call site"_; explicitly _"when a request body, a token or an Authorization header reaches an appender"_                                                                                      | **Owns secret-logging outright.** Cite it. This skill's contribution is upstream: keep the secret out of the type's `toString()` and out of the exception, so redaction is a backstop rather than the only control.                                                                                                                                                                                     |
| `java-exception-design`                                                      | _"translation at layer boundaries with cause preservation"_, hierarchy sizing                                                                                                                                                               | Owns exception design. Take only "the message must not carry secrets or internals" (Effective Java Item 75).                                                                                                                                                                                                                                                                                            |
| `java-strings-and-text`                                                      | _"regex compilation and catastrophic backtracking on untrusted input"_, charsets, _"injection risks that come from building commands, queries and log lines by concatenation"_                                                              | Owns ReDoS mechanics and concatenation-injection. Reference for both; state the _policy_ (allowlist structure, parameterise queries), not the string mechanics.                                                                                                                                                                                                                                         |
| `java-immutability` / `java-object-construction` / `java-design-by-contract` | records, defensive copies, constructor validation, preconditions as contract                                                                                                                                                                | Own the mechanics of "validate in the constructor". This skill argues _which_ invariants are security-load-bearing and why the DTO is not the boundary.                                                                                                                                                                                                                                                 |
| `java-reflection-and-method-handles`                                         | _"the security boundary around loading or invoking anything named by external input"_                                                                                                                                                       | Owns class-name-from-payload. Do not cover it.                                                                                                                                                                                                                                                                                                                                                          |
| `idempotency`                                                                | replay/dedup                                                                                                                                                                                                                                | Adjacent to replay attacks on tokens; leave it alone.                                                                                                                                                                                                                                                                                                                                                   |

**Different repo, must still be excluded by name in prose:** `spring-security-for-apis` lives in
`C:\git\java-skills` (confirmed present in the loaded skill list, not in `C:\git\agent-skills\skills`).
It owns Spring Security _configuration_ — filter chains, JWT/OAuth2 resource server, method
security wiring, CORS. Because it is in another repo it **cannot** be the named neighbour in the
frontmatter exclusion (the suite spec requires a neighbour that exists in _this_ repo — use
`java-defensive-programming` and `structured-logging` for that), but the body should say plainly
that framework configuration is out of scope. This skill is about what the _code_ does: how the
password is stored, where the authorisation decision lives in the domain, what the constructor
refuses.

**Suggested positioning sentence:** the framework-agnostic, code-level half of application
security — the decisions that survive replacing Spring Security with anything else.

---

## 8. What I could not verify

- Exact package and constructor signatures of Spring Security 7.0+'s five `*Password4jPasswordEncoder`
  classes and `HaveIBeenPwnedRestApiPasswordChecker`. Class names confirmed from the reference
  documentation; signatures not read.
- password4j's `Argon2Function.getInstance(...)` argument order and the `Password.hash(...)`
  fluent chain. Version 1.8.4 and the Maven coordinates are confirmed; the API shape is not.
- Whether the OWASP Password Storage Cheat Sheet's PBKDF2-HMAC-SHA1 figure is 1,300,000 or
  1,400,000 — the fetched summary reported both. Confirm before quoting a number for SHA-1
  (it is legacy-only anyway, so prefer omitting it).
- The prose of the Twootr chapter itself (O'Reilly is paywalled). All book claims above are from the
  authors' own published source repository, which is stronger evidence for the code but means I
  cannot quote the chapter's _argument_ verbatim.
- No exact publication date is available for the OWASP cheat sheets — they are continuously updated
  from `master` with no version stamp. Cite by fetch date (2026-08-27).
