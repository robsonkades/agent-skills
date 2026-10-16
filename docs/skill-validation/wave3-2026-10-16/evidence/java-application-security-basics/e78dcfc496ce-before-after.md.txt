# Before and after

Two worked examples, both targeting **Java 21**.

Example A contains **partial snippets**, not standalone compilation units: supply `User`,
`UserRepository` and a caller for top-level statements. Its dependency set is four coordinates —
`org.springframework.security:spring-security-crypto:7.1.1`,
`org.bouncycastle:bcprov-jdk18on:1.85.2`, plus `org.springframework:spring-core` and
`commons-logging:commons-logging` (use the project's dependency management; isolated checks
used `spring-core:7.0.4` and `commons-logging:1.3.5`). The last two are not optional and the crypto POM declares
neither: without `spring-core` the first `matches` call dies with
`NoClassDefFoundError: org/springframework/util/StringUtils`, and every encoder holds a
`LogFactory.getLog(...)` field.

Example B is an **illustrative fragment**, not a compiling unit: the _Before_ uses spring-web
(`@RestController`, `@PostMapping`, `@PathVariable`) and spring-security-core (`@PreAuthorize`,
`@AuthenticationPrincipal`), and the _After_ elides `Role`, `Status`, `NotPermittedException`
and `Order`'s constructor. It compiles under `javac --release 21` once those four are supplied.

---

## A. Password verification — the bug in a book that got everything else right

The source is chapter 6 ("Twootr") of Urma & Warburton, _Real-World Software Development_
(O'Reilly, 2019). The code below is from the authors' own published repository
(`Iteratr-Learning/Real-World-Software-Development`, `chapter_06`), cloned and read
2026-08-27, and **lightly reformatted** — `final class`, a renamed constant, added comments;
every constant, call and argument is the authors'. The chapter's prose is paywalled and is not
quoted here.

It is worth studying precisely because the design reasoning is good. What has drifted is the
arithmetic and one method call.

### Before: password verification

```java
import org.bouncycastle.crypto.generators.SCrypt;
import java.security.SecureRandom;
import java.util.Arrays;
import static java.nio.charset.StandardCharsets.UTF_16;

final class KeyGenerator {
    private static final int SCRYPT_COST = 16384;      // N = 2^14
    private static final int SCRYPT_BLOCK_SIZE = 8;
    private static final int SCRYPT_PARALLELISM = 1;
    private static final int KEY_LENGTH = 20;          // 160 bits
    private static final int SALT_LENGTH = 16;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    static byte[] hash(final String password, final byte[] salt) {
        final byte[] passwordBytes = password.getBytes(UTF_16);
        return SCrypt.generate(passwordBytes, salt, SCRYPT_COST,
                SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELISM, KEY_LENGTH);
    }

    static byte[] newSalt() {
        final byte[] salt = new byte[SALT_LENGTH];
        SECURE_RANDOM.nextBytes(salt);
        return salt;
    }
}

// in Twootr.java
var hashedPassword = KeyGenerator.hash(password, userOfSameId.getSalt());
return Arrays.equals(hashedPassword, userOfSameId.getPassword());
```

**Still current — the design reasoning.** An established memory-hard KDF from a real library
rather than a hand-rolled hash; a per-user 16-byte salt from `SecureRandom`; the salt stored
alongside the hash; the KDF behind one named collaborator so the parameters live in a single
place; and the framing of password storage as a _design_ decision rather than a library call.

**Decisions to review today:**

1. `Arrays.equals` does not promise content-independent timing. A comparison timing channel's
   exploitability depends on the implementation, observation boundary and noise.
   `MessageDigest.isEqual` is the correct fixed-width digest comparison. This is the single most
   instructive line in the chapter for a 2026 reader: a codebase that picked the right KDF and
   the wrong comparison proves that "used a good library" is not "did it correctly".
2. `SCRYPT_COST = 16384` is `N=2^14`, which the current OWASP table pairs with **`p=5`**; the
   book uses `p=1`, below every row of the current table; that does not establish what guidance
   applied when the book was written.
3. `KEY_LENGTH = 20` (160 bits) differs from Spring's 32-byte Argon2 default. That difference
   alone is not a demonstrated weakness; assess KDF cost and the credential contract.
4. `getBytes(UTF_16)` doubles the byte length of ASCII passwords and emits a BOM. UTF-8 is
   conventional for new byte encodings, but existing verification must preserve the old bytes.
5. `User` exposes `byte[] getPassword()` and `byte[] getSalt()` — mutable arrays handed out of
   the aggregate (_Effective Java_ Item 50). Protect the stored value from alias mutation;
   verification can remain in a dedicated credential service with controlled access.
6. OWASP now leads with Argon2id and lists scrypt as the fallback "if Argon2id is not
   available".

### After, step 1 — the one-line fix

If nothing else changes, this line must:

```java
import java.security.MessageDigest;

return MessageDigest.isEqual(hashedPassword, userOfSameId.getPassword());
```

`MessageDigest.isEqual`'s implementation note: "All bytes in `digesta` are examined to
determine equality. The calculation time depends only on the length of `digesta`. It does not
depend on the length of `digestb` or the contents of `digesta` and `digestb`." Note what it
does **not** promise: timing depends on `digesta.length`. For fixed-width digests that is
irrelevant; for variable-length secrets, length still leaks. It is a `byte[]` API with no
`String` overload, which is the point.

### After, step 2 — the structural version

The interesting moves are not "use `PasswordEncoder`" (an agent does that already). They are
overriding the Spring default up to OWASP's parameters, using `upgradeEncoding` as the rehash
path, and doing the same work when the user does not exist.

**Precondition:** this fragment reads encoded Argon2 credentials. It is not a drop-in
migration of the preceding raw scrypt hashes. During that migration retain a versioned legacy
verifier with the exact salt, `N/r/p`, output length and UTF-16+BOM encoding; select it from
trusted stored format metadata. Rehash with the new policy only after successful old-format
verification and replace the credential conditionally. Test non-ASCII legacy passwords,
failed logins and a concurrent reset; retire old verification only under an explicit recovery
policy. Prefixing raw legacy bytes with a standard encoder id does not adapt their format.

```java
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.Optional;
import java.util.UUID;

final class PasswordVerifier {

    private final PasswordEncoder encoder;
    private final UserRepository repository;
    private final String dummyHash;

    PasswordVerifier(UserRepository repository) {
        // Spring's defaultsForSpringSecurity_v5_8() is m=16384; OWASP's floor at t=2,p=1
        // is 19456. Chosen 2026-08-27; verification measured at <N> ms/op on <host> —
        // fill both in, and re-measure when the hardware changes.
        this.encoder = new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
        this.repository = repository;
        // Current parameters; legacy hashes can still have different verification costs.
        this.dummyHash = this.encoder.encode(UUID.randomUUID().toString());
    }

    boolean login(String userId, String password) {
        Optional<User> user = repository.findById(userId);
        String stored = user.map(User::passwordHash).orElse(dummyHash);

        boolean ok = encoder.matches(password, stored);   // one KDF on either path
        if (!ok || user.isEmpty()) {
            return false;
        }
        if (encoder.upgradeEncoding(stored)) {            // rehash on successful login
            // Compare-and-set avoids two concurrent logins overwriting a newer credential.
            repository.replaceHashIfCurrent(userId, stored, encoder.encode(password));
        }
        return true;
    }
}
```

`encoder.matches` uses a content-independent comparison (`constantTimeArrayEquals` in
`Argon2PasswordEncoder`). The dummy hash is what stops the not-found path returning in
microseconds while the found path performs a KDF. It does not make both requests perfectly
indistinguishable: repository/cache paths and downstream work can remain statistically visible,
so use a common response and rate limiting as well. Spring's own `DaoAuthenticationProvider`
lost the dummy-hash mitigation once
(CVE-2025-22234), which is how routine a regression it is. `upgradeEncoding` is what makes a
future parameter increase detectable. An algorithm migration also needs compatible format
routing and rollout/recovery decisions — see `password-storage.md` §3 for the encoder that
does not implement this hook, and for the bcrypt re-encode that now throws.

`User::passwordHash` returns the encoded `String`, not a `byte[]` the caller can mutate — and
the credential repository/verifier own access to it; keep it out of public user DTOs and logs.

---

## B. Authorisation — from the controller to the domain operation

### Before: controller-only authorisation

```java
@RestController
class OrderController {
    @PreAuthorize("hasRole('CUSTOMER')")
    @PostMapping("/orders/{id}/cancel")
    void cancel(@PathVariable String id, @AuthenticationPrincipal Principal p) {
        orderService.cancel(id);          // ownership never checked at all
    }
}

class OrderService {
    void cancel(String id) {              // any caller: scheduler, consumer, another controller
        orders.findById(id).orElseThrow().cancel();
    }
}
```

Two failures. The role is checked without the _instance_ — "is a CUSTOMER" is not "owns this
order", which is the IDOR/BOLA class. And `OrderService.cancel` trusts that it was called from
the one place that checks: the `CancelStaleOrdersJob` added six months later calls `cancel(id)`
and no check runs at all. Note that this is what "we'll add security later" reliably produces —
authorisation added late is added at the controller, because that is the cheapest place to bolt
it on, and it stays there.

### After

```java
import java.util.Objects;
import java.util.Set;

public record Actor(String id, Set<Role> roles) {
    public Actor {
        Objects.requireNonNull(id, "id");
        roles = Set.copyOf(roles);
    }
}

public final class Order {
    private final String id;
    private final String ownerId;
    private Status status;

    public void cancelBy(Actor actor) {
        if (!actor.id().equals(ownerId) && !actor.roles().contains(Role.SUPPORT)) {
            throw new NotPermittedException("cancel", id);   // same message for both causes
        }
        if (status != Status.PLACED) {
            throw new IllegalStateException("cannot cancel order in status " + status);
        }
        this.status = Status.CANCELLED;
    }
}
```

**The signature makes the check mandatory; it does not authenticate the actor.** Every caller
must supply an `Actor`, so a scheduler must use an explicit system identity and the decision is
auditable at one site. The inbound adapter must construct it from a trusted authentication
context; accepting roles or tenant from request JSON defeats the design. The controller keeps
`@PreAuthorize` as cheap early rejection — it is simply no longer the only check.
The role copy prevents later mutation through a caller-owned set. It is a request-scoped
snapshot, not proof that a role remains current indefinitely. This example assumes globally
unique subject ids and a global SUPPORT permission; tenant-scoped support needs an explicit
tenant predicate, even when a role matches.
`NotPermittedException` must be mapped to the same external shape as absence if resource
enumeration matters; internal audit records may retain the real reason under access control.

The read, authorisation and state transition must also be consistent. If another transaction
can transfer ownership or change status between the Java check and persistence, use one
transaction with appropriate isolation or a conditional update containing owner, tenant,
expected version and expected state. The domain `if` alone cannot close a datastore TOCTOU gap.

**The trade-off, stated honestly.** `Actor` now threads through the domain API and the domain
has acquired an authorisation concept it did not have. That is the price. It is worth paying
when the domain operation owns that rule. An existing application-service guard can be
adequate if every relevant entry path necessarily passes it and the write enforces the checked
state. Preserve that boundary when demonstrated. Public reference reads need no ownership
concept merely to resemble this example.

## How to tell it worked

- Call the protected operation directly with a foreign actor and assert refusal without a web
  layer. Mutate the source role set after actor creation and assert it grants no new authority.
- Trace other callers of the service method and their applicable policies. A reachable path
  missing a required check is a defect; an explicit authorised system operation is not.
- Compare login latency distributions for known-absent and known-present users across warm and
  cold repository paths. If one class omits a KDF run, the dummy hash is missing or misplaced;
  small residual differences are not proof of an exploitable oracle or of its absence.

## Sources for the claims in this example

- [Java SE 25 `MessageDigest.isEqual`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/security/MessageDigest.html#isEqual(byte%5B%5D,byte%5B%5D)>)
- [Java SE 21 `Set.copyOf`](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Set.html#copyOf(java.util.Collection)>) — collection changes do not change the returned set.
- [Spring Security advisory CVE-2025-22234](https://spring.io/security/cve-2025-22234/)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Insecure Direct Object Reference prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
