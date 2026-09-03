# Password policy: NIST 800-63B-4 and ASVS 5.0 side by side

Read when setting or reviewing registration, change-password or password-strength rules.
Storage parameters are `password-storage.md`; this file is about what the user is allowed to
choose. Both sources fetched **2026-08-27**.

## NIST SP 800-63B, Version 4, dated 26 August 2025

Section 3.1.1.2 "Password Verifiers". Revision 4 renamed "memorized secrets" to
**"passwords"** — the old term is gone from the current text, so do not write it as though it
were current.

| Requirement                                                      | Force     |
| ---------------------------------------------------------------- | --------- |
| Minimum **15 characters** where the password is single-factor    | SHALL     |
| Minimum 8 characters where the password is one factor within MFA | SHALL     |
| Permit a maximum length of at least 64 characters                | SHOULD    |
| Accept all printing ASCII characters and the space character     | SHOULD    |
| Accept Unicode characters                                        | SHOULD    |
| Impose composition rules (mixtures of character types)           | SHALL NOT |
| Require subscribers to change passwords periodically             | SHALL NOT |
| Compare the prospective secret against a blocklist               | SHALL     |
| Permit a hint accessible to an unauthenticated claimant          | SHALL NOT |
| Salt and hash with a suitable password hashing scheme            | SHALL     |
| Salt at least 32 bits                                            | SHALL     |
| Additional keyed-hash iteration with a verifier-only secret      | SHOULD    |
| Rate-limit failed authentication attempts                        | SHALL     |
| Allow password managers and autofill                             | SHALL     |
| Permit paste                                                     | SHOULD    |

The blocklist requirement is specific: commonly used, breached and context-specific values,
and "entire password SHALL be subject to comparison, not substrings". The pepper key "SHALL be
stored separately from the hashed passwords" and "SHOULD be stored and used within a
hardware-protected area".

Note the salt floor. NIST says ≥ 32 bits; every modern KDF default is 128. Treat 32 as a
legacy floor, never a target.

Unicode introduces a policy decision that simplistic summaries omit. NIST says each Unicode
code point counts as one character and **SHOULD** be NFC-normalised before hashing. It also
**MAY** allow narrowly defined mistyping transformations. ASVS v5.0.0-6.2.8 instead requires
verification exactly as received, without truncation or case transformation. Do not introduce
normalisation only on login: registration, breach-list comparison, change and verification must
use one versioned rule, and a change can strand existing hashes. If ASVS conformance binds,
prefer exact verification and document why the NIST SHOULD was not adopted.

## OWASP ASVS 5.0.0 (published May 2025)

V6.2 Password Security:

- **6.2.1** "user set passwords are at least 8 characters in length although a minimum of 15
  characters is strongly recommended."
- **6.2.4** checked against at least the top 3000 passwords matching the application's policy.
- **6.2.5** "passwords of any composition can be used, without rules limiting the type of
  characters permitted."
- **6.2.8** "verifies the user's password exactly as received from the user, without any
  modifications such as truncation or case transformation."
- **6.2.9** "passwords of at least 64 characters are permitted."
- **6.2.10** password stays valid until compromised or rotated by the user; "must not require
  periodic credential rotation."
- **6.2.12** checked against a set of breached passwords.

V11 Cryptography — the _storage_ requirement lives here, not in V6:

- **11.4.2** (L2) stored with an approved, computationally intensive KDF, "with parameter
  settings configured based on current guidance."
- **11.4.4** (L2) approved KDFs with key-stretching parameters when deriving keys from
  passwords.
- **11.5.1** (L2) non-guessable random values from a CSPRNG with at least **128 bits** of
  entropy — and the requirement ends "Note that UUIDs do not respect this condition." A
  `UUID.randomUUID()` token carries 122 bits, so under an L2 assessment it is a finding even
  though it is not a cryptographic weakness. See `password-storage.md` §5.
- **11.2.4** (L3) "all cryptographic operations are constant-time, with no 'short-circuit'
  operations in comparisons, calculations, or returns."

ASVS 5.0 deliberately names no algorithm in requirement text; it defers to the Password
Storage Cheat Sheet. That is why parameters are cited from the cheat sheet and the
_requirement_ from ASVS.

## The conflict, and the question that decides it

They are not the same bar. **ASVS 6.2.1: 8, with 15 strongly recommended. NIST 800-63B-4: 15
SHALL, for single-factor.** A team that says "we follow NIST" and enforces 8 characters with no
second factor is non-compliant.

Do not resolve this by quietly picking the stricter or the more convenient number. Ask:

1. **Which regime does this system actually answer to?** US federal systems and anything whose
   contract or audit cites 800-63B are bound by the SHALL. A commercial product measuring
   itself against ASVS L1/L2 is bound by 6.2.1.
2. **Is the password ever the only factor?** NIST's 15 applies to single-factor use. If every
   authentication path enforces a second factor, NIST's own floor is 8 and the disagreement
   evaporates.
3. **If neither binds**, say so and pick 15 as the default with 8 as the MFA path — you are
   then choosing, not claiming compliance.

Both standards align on the direction of the other major controls: no composition rules, no
periodic rotation, support for at least 64 characters, and a breached-password check. Preserve
the normative distinction when claiming compliance — for example, NIST's maximum-length rule
is a SHOULD — and add NIST's mandatory failed-attempt rate limiting and password-manager
support rather than treating password policy as a registration-regex problem.

## The trap for anyone summarising from memory

It is tempting to write "NIST relaxed the password rules, so 12 characters is over-strict".
It did not relax length. **800-63B-4 raised the single-factor minimum to 15 (SHALL).** The
correct statement is: drop the composition rules and the expiry, _raise_ the floor to 15 for
single-factor, and add a breach-corpus check (ASVS 6.2.12 / the NIST blocklist SHALL). A
policy of "minimum 12, one uppercase, one digit, one symbol, expires every 90 days" is
simultaneously too permissive on length and prohibited on composition and rotation — and its
measured effect is `Password1!` followed by `Password2!`.

For the breach check, Spring Security has shipped
`org.springframework.security.web.authentication.password.HaveIBeenPwnedRestApiPasswordChecker`
— in spring-security-**web**, `@since` **6.3**, implementing `CompromisedPasswordChecker`
(spring-security-core, also 6.3). It does not require Spring Security 7. `UNVERIFIED:` its
constructor signature; module, package and `@since` are confirmed from the 7.1.1 sources jars.

## Authoritative sources

- [NIST SP 800-63B-4, password verifiers](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver)
- [NIST SP 800-63B-4 change log](https://pages.nist.gov/800-63-4/sp800-63b/changelog/)
- [OWASP ASVS v5.0.0 repository and stable artifacts](https://github.com/OWASP/ASVS/tree/v5.0.0_release)
- [Spring Security compromised-password checking](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/compromised.html)
