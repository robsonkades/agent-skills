# Password storage, peppering and randomness

Every figure below carries its source and the date it was read. Guidance moves; a parameter
without a date is a parameter nobody can audit. All web sources fetched **2026-08-27**.

## 1. OWASP parameters

From the OWASP Password Storage Cheat Sheet (continuously versioned from `master`; there is
no release number — cite by fetch date).

**Argon2id.** Three parameters: minimum memory size `m`, iterations `t`, parallelism `p`.
Each row is an equivalent-security alternative — pick one row, do not mix.

| m              | t   | p   |
| -------------- | --- | --- |
| 47104 (46 MiB) | 1   | 1   |
| 19456 (19 MiB) | 2   | 1   |
| 12288 (12 MiB) | 3   | 1   |
| 9216 (9 MiB)   | 4   | 1   |
| 7168 (7 MiB)   | 5   | 1   |

**scrypt**, if Argon2id is unavailable: `N=2^17 (128 MiB), r=8, p=1` / `N=2^16, r=8, p=2` /
`N=2^15, r=8, p=3` / `N=2^14, r=8, p=5` / `N=2^13, r=8, p=10`.

**bcrypt** — "The work factor should be as large as verification server performance will
allow, with a minimum of 10." And: "bcrypt has a maximum length input length of 72 bytes for
most implementations, so you should enforce a maximum password length of 72 bytes."

**PBKDF2**, where FIPS certification forces it: HMAC-SHA256 **600,000** iterations;
HMAC-SHA512 **220,000**. `UNVERIFIED:` the HMAC-SHA1 figure — the fetched summary reported
both 1,300,000 and 1,400,000. SHA-1 is legacy-only; prefer omitting a number rather than
quoting the wrong one.

**Upgrading legacy hashes.** Two sanctioned routes: expire inactive users' passwords, or
layer the hashes (`bcrypt(md5($password))`) and replace with a direct hash on next login.

## 2. Argon2id versus bcrypt — the live disagreement

OWASP is unambiguous: Argon2id first, scrypt if unavailable, bcrypt for legacy, PBKDF2 where
FIPS demands it. Practitioners are not, and both positions are defensible.

- **The technical crux is memory-hardness, and it is quantitative.** bcrypt uses a fixed
  4 KiB working set, so an 8 GiB GPU parallelises it massively; Argon2id at 46 MiB permits
  roughly 175 concurrent instances on the same card (8 GiB ÷ 46 MiB ≈ 178). That is the entire
  argument.
- **The counter-position**: bcrypt at cost ≥ 12 is not broken, and there is no incident
  record of bcrypt-at-adequate-cost being the proximate cause of a breach. Migration has real
  cost and real risk; the gap is about long-term direction, not urgent remediation.
- **A JVM-specific complication that appears in essentially no blog post.**
  `Argon2PasswordEncoder`'s own class javadoc: _"The currently implementation uses Bouncy
  castle which does not exploit parallelism/optimizations that password crackers will, so
  there is an unnecessary asymmetry between attacker and defender."_ On the JVM the
  defender's Argon2 is slower per unit of security than the attacker's. That partially erodes
  the theoretical advantage and is a legitimate reason a Java shop stays on bcrypt.

## 3. Spring Security encoder facts (verified against the `spring-security-crypto:7.1.1` sources jar)

`spring-security-crypto` needs no Spring _context_ — you do not need the framework to use
`PasswordEncoder`. It is not, however, self-contained: as of 7.1.1 it needs `spring-core` on
the classpath (`org.springframework.util.StringUtils`, used by
`AbstractValidatingPasswordEncoder.matches`) and `commons-logging` (every encoder holds a
`LogFactory.getLog(...)` field), and its POM declares neither, so no build tool will supply
them. Omitting them compiles cleanly and fails at the first `matches` call with
`NoClassDefFoundError`.

```java
public interface PasswordEncoder {                                  // ...crypto.password
    @Nullable String encode(@Nullable CharSequence rawPassword);
    boolean matches(@Nullable CharSequence rawPassword, @Nullable String encodedPassword);
    default boolean upgradeEncoding(@Nullable String encodedPassword);   // default: false
}
```

`upgradeEncoding` is the sanctioned rehash-on-login hook and is widely unknown. It is how a
cost increase, an algorithm change and a pepper rotation get applied without a migration job —
see `before-after.md`. One exception, verified by grep over the 7.1.1 sources:
`Argon2PasswordEncoder`, `BCryptPasswordEncoder`, `SCryptPasswordEncoder` and
`DelegatingPasswordEncoder` override `upgradeEncodingNonNull`, but **`Pbkdf2PasswordEncoder`
does not**, so it inherits the `false` default. With PBKDF2 neither an iteration raise nor a
pepper rotation will ever trigger a rehash; that decision is yours to write.

**`org.springframework.security.crypto.argon2.Argon2PasswordEncoder`** — defaults
`saltLength=16, hashLength=32, parallelism=1, memory=1<<14 (16384 KiB), iterations=2`, i.e.
`defaultsForSpringSecurity_v5_8()`. OWASP's floor at `t=2, p=1` is `m=19456`, so the default
is **below guidance**; `new Argon2PasswordEncoder(16, 32, 1, 19456, 2)` closes it. `matches`
uses an internal `constantTimeArrayEquals` (`result |= expected[i] ^ actual[i]`) — correct.
Requires BouncyCastle on the classpath.

**`org.springframework.security.crypto.password.Pbkdf2PasswordEncoder`** — defaults
`PBKDF2WithHmacSHA256`, salt 16, hash width 256, **310,000** iterations against OWASP's
600,000. `matches` uses `MessageDigest.isEqual` — correct. Its first constructor argument,
`CharSequence secret`, **is a pepper**, and is the only first-party pepper support in Spring
Security.

**`org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder`** — default strength 10,
the OWASP _minimum_ with no headroom. `BCryptVersion` is `$2A`, `$2Y`, `$2B`. On a malformed
stored hash `matches` logs `"Encoded password does not look like BCrypt"` and returns false.

**The 72-byte limit — it throws; it does not silently truncate.** This is the opposite of what
most write-ups (and this skill's own research brief, since corrected) claim. Verified in the
7.1.1 sources jar, `…crypto.bcrypt.BCrypt.hashpw(byte[], String, boolean)`:

```java
// Enforce max length for new passwords only
if (!for_check && passwordb.length > 72) {
    throw new IllegalArgumentException("password cannot be more than 72 bytes");
}
```

That guard is the fix for **CVE-2025-22228** (`matches` returned true for any two passwords
over 72 characters sharing a 72-character prefix) and ships in every supported line since March
2025 — OSS 6.3.8 / 6.4.4 and enterprise 5.7.16 / 5.8.18 / 6.0.16 / 6.1.14 / 6.2.10. Three
consequences, all checkable:

1. **`encode()` throws.** A registration form advertising 128-character passphrases produces an
   `IllegalArgumentException` out of `PasswordEncoder.encode` and a 500 at sign-up. The finding
   is a **missing boundary check that fails loudly**, not a hidden compliance hole. Note that
   the ceiling is 72 _bytes_: 64 characters of non-ASCII UTF-8 can exceed it, so a form that
   satisfies ASVS 6.2.9 ("at least 64 characters permitted") on a character count can still
   throw.
2. **`matches()` deliberately skips the guard** (`for_check == true`), so hashes written before
   the upgrade still verify by truncated comparison — the ASVS 6.2.8 violation ("without any
   modifications such as truncation") lives on the _verify_ path, for legacy hashes only.
3. **Any path that re-encodes an over-length password now throws**: a password change, a
   re-registration, or a rehash under `upgradeEncoding` on successful login. Users whose stored
   hash came from a >72-byte password must reset. Plan that before raising a bcrypt cost factor
   on an old estate.

On versions predating the fix the classic silent-truncation reading is correct — so date the
claim before repeating it. The remediation is unchanged and now fixes an availability bug as
well as a correctness one: cap at 72 _bytes_ at the trust boundary, or use Argon2id.

Worth knowing because it is this skill's own subject arriving from the framework: the same
max-length fix introduced **CVE-2025-22234** (MEDIUM, 22 April 2025), which broke
`DaoAuthenticationProvider`'s timing mitigation and reintroduced a username-enumeration oracle
— affecting 6.4.4 and 6.3.8 with their back-ports, fixed in 6.4.5 and 6.3.9. That is the
failure the dummy-hash pattern in `before-after.md` exists to prevent, shipped by the
framework itself.

**`DelegatingPasswordEncoder`.** Storage format `{id}encodedPassword`, e.g.
`{bcrypt}$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG`; the id must be at the
start, opening `{` and closing `}`. Built by
`PasswordEncoderFactories.createDelegatingPasswordEncoder()`. The ids that matter: `bcrypt`,
`noop`, `pbkdf2`, `pbkdf2@SpringSecurity_v5_8`, `scrypt`, `scrypt@SpringSecurity_v5_8`,
`argon2`, `argon2@SpringSecurity_v5_8`, `sha256` (it also registers `ldap`, `MD4`, `MD5`,
`SHA-1` and `SHA-256`, all of which exist to _read_ legacy hashes, never to write new ones).
**`idForEncode` is `"bcrypt"`** in 7.1.1 —
not Argon2id. This is the format that makes migration possible: the algorithm identity
travels with each stored hash, so two algorithms coexist during a rollout. A homegrown
`CryptoUtils` that stores a bare hash throws that away.

**New in Spring Security 7.0**, all in `org.springframework.security.crypto.password4j` and
confirmed absent from the 6.5.11 jar: `Argon2Password4jPasswordEncoder`,
`BcryptPassword4jPasswordEncoder`, `ScryptPassword4jPasswordEncoder`,
`Pbkdf2Password4jPasswordEncoder`, `BalloonHashingPassword4jPasswordEncoder` — first-party
wrappers over password4j. `UNVERIFIED:` their constructor signatures; the package is confirmed
from the 7.1.1 jar, the javadoc and source were not read.

**Older than most people think — do not make a version upgrade a prerequisite for these.**

| Feature                                                         | Module and package                                                                  | `@since` |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| `HaveIBeenPwnedRestApiPasswordChecker`                          | spring-security-**web**, `org.springframework.security.web.authentication.password` | **6.3**  |
| `CompromisedPasswordChecker` (the interface)                    | spring-security-core, `org.springframework.security.authentication.password`        | **6.3**  |
| `/.well-known/change-password` (`PasswordManagementConfigurer`) | spring-security-config                                                              | **5.6**  |

So the ASVS 6.2.12 / NIST breach-corpus check has been available since May 2024, on Boot 3.3,
and it is not in the crypto module at all.

**password4j** (`com.password4j:password4j:1.8.4`, Apache-2.0) is the library Spring Security 7
chose to wrap, which is a reasonable signal. `UNVERIFIED:` the signature of
`Argon2Function.getInstance(...)` and the `Password.hash(...).addSalt(...).addPepper(...)
.with(...)` fluent chain — coordinates confirmed, API shape reported by search results only.

## 4. Peppering

A pepper is shared across stored passwords, unlike a per-password salt. OWASP: it "should not
be public and should not be stored along with the generated hash… should be stored separately
from the password database", in a secrets vault or an HSM. NIST 800-63B-4 says **SHOULD**
(keyed hash, key stored separately, ideally hardware-protected).

**Java mechanics most discussions get wrong:**

- **Argon2** has a native pepper. BouncyCastle's
  `org.bouncycastle.crypto.params.Argon2Parameters.Builder.withSecret(byte[])` is Argon2's
  key `K`; no HMAC pre-hash construction is needed. `Argon2BytesGenerator.generateBytes` also
  accepts `char[]`, so the `char[]` discipline survives to the KDF here.
- **PBKDF2 in Spring**: the `secret` constructor argument.
- **bcrypt** has no key parameter, so you need OWASP's construction:
  `bcrypt(base64(hmac-sha384(data:$password, key:$pepper)), $salt, $cost)`. The base64 is not
  decorative — it defeats null-byte truncation; the HMAC is not interchangeable with a plain
  hash — it defeats _password shucking_.
- **Rotation is solvable and nobody writes the code**: verify with the current pepper, fall
  back to the previous, rehash and store on success. That is the `upgradeEncoding` shape — but
  `Pbkdf2PasswordEncoder`, the one Spring encoder with a pepper, does not override it (§3), so
  here you write the rehash yourself.

**The honest case against**: if the app server is compromised the pepper goes with the
database in most architectures, so the extra boundary is often illusory; and one known
plaintext plus salt plus algorithm makes a pepper brute-forceable. **The case for**: it is the
only control that helps in the specific, common scenario of a _database-only_ compromise — SQL
injection, a leaked backup, a misconfigured replica. Where it lives is the sharper argument:
HSM (NIST's preference, rare), a secrets manager (common), an environment variable
(contradicted by OWASP's own advice, §6), or the config file — which defeats the point
entirely, since config and DB dumps leak together.

## 5. Randomness

`java.security.SecureRandom` class javadoc: "must produce non-deterministic output".
`getInstanceStrong()` is "for high-value/long-lived secrets like RSA public/private keys", and
carries an explicit blocking caveat: `generateSeed`, `reseed` and `nextBytes` "may block as
entropy is being gathered, for example, if the entropy source is /dev/random". On a container
with a thin entropy pool that is a real startup hang.

- `new SecureRandom()` for salts, session ids, reset tokens, CSRF tokens, API keys, OTPs.
- `getInstanceStrong()` only for long-lived key material. Do not reach for it reflexively.
- `setSeed` "supplements, rather than replaces, the existing seed" — `new SecureRandom(seed)`
  is not a way to make it deterministic, and a test that assumes so is confused.
- `new Random()`, `Math.random()` and `ThreadLocalRandom` are a 48-bit LCG: observe two
  outputs, predict the rest. Java 17's `RandomGenerator` supertype makes this **worse**,
  because `SecureRandom` and `Xoshiro256PlusPlus` now look interchangeable at a call site.
- `UUID.randomUUID()` is **not a cryptographic defect** — its javadoc specifies "a
  cryptographically strong pseudo random number generator", it is version 4, and it carries 122
  bits of entropy. The common objection confuses it with UUID v1. But it **is** a finding under
  an ASVS L2 assessment, because 11.5.1 ends: _"Note that UUIDs do not respect this
  condition."_ — the standard names them explicitly as not meeting the 128-bit bar. So: where
  ASVS L2 is claimed or audited, emit 16 bytes from `SecureRandom` and Base64url-encode them;
  everywhere else leave an existing `UUID.randomUUID()` token alone rather than spending a
  change on 6 bits. `UUID.nameUUIDFromBytes` (v3/MD5) is deterministic and genuinely unsafe.

## 6. Secrets in the running system

OWASP Secrets Management Cheat Sheet, _Containers & Orchestrators_ section, verbatim:
**"Environment variables are generally
accessible to all processes and may be included in logs or system dumps. Using environment
variables is therefore not recommended unless the other methods are not possible."** Preferred:
a mounted volume, or an in-memory fetch from a secret store. This contradicts the 12-factor
habit of `SPRING_DATASOURCE_PASSWORD` in the environment, and is worth stating plainly rather
than letting a team believe the variable is the remediation.

Lifecycle: creation, rotation, revocation, expiration. "You should regularly rotate secrets so
that any stolen credentials will only work for a short time." A secret committed to
`application.yml` is permanent in git history — rotating without purging history is not
remediation. Without `gitleaks`/`trufflehog` or platform secret scanning in CI, this class of
defect is found by an outsider.

## 7. `char[]` versus `String`

The JDK states the rationale itself, in `javax.crypto.spec.PBEKeySpec`: "the String class is
immutable and there is no way to overwrite its internal value when the password stored in it
is no longer needed. Hence, this class requests the password as a char array, so it can be
overwritten when done."

**The memory-scrubbing argument is largely obsolete and should not be sold as a control:**

1. A moving/compacting collector — G1, ZGC, Shenandoah, i.e. every collector you will run on
   Java 21+ — may have copied the array repeatedly. `Arrays.fill(pw, '\0')` zeroes one copy.
2. The password almost certainly existed as a `String` before it reached you: HTTP parameter
   decoding, Jackson, JDBC.
3. `PasswordEncoder.encode(CharSequence)` calls `.toString()` internally (verified in
   `BCryptPasswordEncoder`), so the whole Spring path is `String`-based regardless.
   `CharBuffer.wrap(char[])` _is_ a `CharSequence`, but it is materialised anyway.
4. There is no supported way to zero a `String`'s backing array on Java 21. `sun.misc.Unsafe`
   was the hack; JEP 471 deprecated the memory-access methods for removal in JDK 23, JEP 498
   made the warning the default in 24, and JDK 25 still has them deprecated-for-removal.
   `VarHandle` and FFM offer no replacement for reaching into a heap `String`.

**What `char[]` still buys**: it shortens the window against a heap or core dump taken after
use; and, more usefully, it is a **type-level signal** — a `char[]` component will not
accidentally appear in a `toString()`, in string deduplication or in the constant pool the way
a `String` will. Keep it where the API demands it (`PBEKeySpec`, `Console.readPassword()`,
`JPasswordField.getPassword()`, `Argon2BytesGenerator.generateBytes(char[], byte[])`). Do not
contort a Spring stack to thread it through. Spend the effort instead on never putting the
credential in a field, a log, a `toString()` or an exception message.

## 8. Recording the choice

Store the parameters, the date they were chosen and the measured verification time next to the
encoder bean. A cost factor chosen in 2018 breaks no test and fails no health check; nothing
in the system makes it visible.
