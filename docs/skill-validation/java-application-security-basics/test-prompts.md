# Test prompts — `java-application-security-basics`

Nine prompts for selection testing. Five must route to this skill; four are near misses that
must route to a named neighbour instead. None of them names the skill.

## Must trigger

1. **"We store password hashes with `BCryptPasswordEncoder` from
   `PasswordEncoderFactories.createDelegatingPasswordEncoder()`. Our compliance questionnaire
   asks whether we follow OWASP password storage guidance — can I answer yes?"**
   Targets the highest-value claim: the framework default is bcrypt at strength 10 and
   `idForEncode` is still `"bcrypt"`, so the honest answer is no on both algorithm and
   parameters.

2. **"Review this login method."** (paste)

   ```java
   User user = repository.findById(userId).orElseThrow();
   MessageDigest md = MessageDigest.getInstance("SHA-256");
   byte[] attempt = md.digest(password.getBytes());
   return Arrays.equals(attempt, user.getPasswordHash());
   ```

   Four findings the skill exists to catch: fast digest as a KDF, no salt, default charset,
   non-constant-time comparison, plus the `orElseThrow` enumeration oracle.

3. **"`OrderController.cancel` has `@PreAuthorize("hasRole('CUSTOMER')")`. I'm adding a
   `CancelStaleOrdersJob` that calls `orderService.cancel(id)` on a schedule. Anything I should
   watch out for?"**
   The authorisation-at-the-domain-boundary case, arriving as an innocent feature question.

4. **"Product wants a password policy: minimum 12 characters, one uppercase, one digit, one
   symbol, expiring every 90 days. Is that reasonable for a Java service?"**
   Must surface the NIST 800-63B-4 / ASVS 5.0 conflict and the deciding question, and must not
   say "NIST relaxed the rules".

5. **"Three of our services each call `BCryptPasswordEncoder` directly. I want one
   `hash(String)` helper in our commons library so we can change algorithm in one place — how
   should I structure it?"**
   The over-application counter-example, phrased as a packaging question and sharing no
   distinctive token with the description. The wrapper destroys the `{id}` prefix that makes
   migration possible. A skill that only answers where the class should live has failed.

## Must NOT trigger (near misses)

6. **"Our `RefundRequest` amount is validated with `@Positive` on the DTO, again with
   `Objects.requireNonNull` and a range check in `RefundService`, again in the `Refund`
   constructor, and there's a CHECK constraint in the database. Which of these should I
   delete?"**
   → `java-defensive-programming`. This is the layering question about a non-adversarial
   invariant. The security skill explicitly disclaims it in the body and in the exclusion.

7. **"Our JSON access logs include the whole request body, and some requests carry an
   `Authorization` header. How do we stop that reaching the appenders across all our
   services?"**
   → `structured-logging`. Redaction at the encoder is owned outright there; this skill's
   contribution is upstream (keep it out of the type) and does not answer the question asked.

8. **"We keep API keys in a session object we cache in Redis with Java serialization — is that
   a problem?"**
   → `java-serialization-hardening`. A genuinely mixed case: "API keys" matches this skill's
   description, but the question is about untrusted bytes crossing a process boundary, which is
   the neighbour's subject outright. Must route to the neighbour; a secondary note about the key
   living in a serialized type is acceptable, answering here instead is not.

9. **"How do I configure the filter chain so `/admin/**` requires ROLE_ADMIN and everything else
   is authenticated?"**
   → Nothing in this repo. Straight Spring Security configuration, which the body explicitly
   disclaims in favour of `spring-security-for-apis` in another repository. This exercises the
   out-of-repo boundary the skill claims only in prose.

## Notes for the validator

- Prompt 3 is the weakest trigger by design — nothing in it says "security". If it lands on a
  scheduling or Spring skill instead, the frontmatter's `@PreAuthorize`/scheduler clause needs
  strengthening rather than the body.
- Prompt 6 is the sharpest boundary risk. If it pulls this skill, the exclusion clause
  ("where to defend and how many layers may re-check an invariant") is not doing its job.
- Prompt 7 is a partial-overlap risk rather than a clean miss: the skill legitimately owns
  "the secret is in the record's `toString()`". Landing on this skill _in addition to_
  `structured-logging` is acceptable; landing on it _instead_ is not.
- Prompts 5 and 8 were rewritten after iteration 1. The originals reused distinctive tokens from
  the description (`CryptoUtils.hash(String)`; `readObject` / "gadget chain"), so they tested
  string matching rather than routing. Prompt 9 is new, covering the out-of-repo boundary.
