# Trust boundaries

A trust boundary is any seam where data arrives from code whose correctness this codebase
does not control. Validation belongs _on_ the boundary; inside it, the type system carries
the proof.

## Finding the boundaries

Always boundaries:

- **Process edges**: HTTP request bodies and parameters, message-queue payloads, CLI
  arguments, files, environment and configuration values. Deserialization construction semantics
  are framework/configuration-specific: modern Jackson record binding normally invokes the
  canonical constructor, while field/unsafe/reflection-based mechanisms may bypass assumptions.
  Test the configured mapper and still enforce invariants in the domain construction path.
- **Storage reads**: the database schema enforces less than the domain does (a `CHECK`
  constraint rarely encodes "reserved ≤ onHand"), and yesterday's writer may predate
  today's invariant. Reconstitution is a boundary, thinner than the request edge.
- **A published library's public API** — even inside "your own" monorepo. Its callers are
  by definition code the library does not control; today's disciplined caller is not
  tomorrow's. `Objects.requireNonNull` on every public parameter of a shared module is
  a common baseline where the contract forbids null, not a substitute for specifying the contract.
- **Callbacks and SPI implementations supplied by others**: what they return to you is
  input.

Not boundaries:

- Private and package-private methods called only by code in the same module.
- Data already carried by a validated type (`CustomerId`, `Money`) — the constructor was
  the check.
- The seam between two internal layers of the same deployable (service → repository).
  Layering is about dependency direction, not trust; re-validating there duplicates the
  boundary check without adding safety.

Heuristic for ambiguous seams: _could a change in code outside this module put a bad value
here without any compile error in this module?_ Yes → boundary.

## What to do at a boundary

Order matters: **bound raw representation → decode strictly → canonicalize if the contract says so
→ validate semantics → construct the proof-carrying type**.

```java
public static AccountId parse(String raw) {
    Objects.requireNonNull(raw, "raw");
    return new AccountId(raw.strip().toUpperCase(Locale.ROOT)); // ctor validates format
}
```

An inexpensive raw size/structure check prevents work amplification before normalization. A
canonicalization policy can then produce one stored form, but it must be specific to the field:
whitespace/case/Unicode changes are wrong for passwords, signatures and many opaque identifiers.
Changing meaning (defaulting, clamping, truncating) requires an explicit compatibility rule rather
than being smuggled in as cleanup.

## Checks that look redundant but are load-bearing — do not delete

- **TOCTOU-shaped state checks**: an earlier observation can be stale after concurrent work or
  another transaction. A second check is useful only when coupled atomically enough with the
  mutation—under one lock/CAS, conditional SQL update/constraint or isolation protocol. A plain
  “check then act” merely narrows the race window.
- **Checks guarding a different invariant that happens to read the same field**: the
  boundary checked "non-null, well-formed"; the interior checks "sufficient balance". Same
  data, different expectation — keep it.
- **`Objects.requireNonNull` in a constructor that stores the reference**: even for
  parameters "already checked" upstream, a constructor establishing an invariant for its
  own instance is the one place stating it is cheap and permanent. This is contract
  enforcement, not boundary defence — the distinction lives in java-design-by-contract.
- **Validation duplicated between client and server**: the client's copy is UX; the
  server's copy is the defence. Removing either "duplicate" removes something real.
- **Defensive copies of mutable arguments or return values at a boundary**: aliasing, not
  nullness, is the threat; mechanics in java-immutability.

## The overengineering line

Defence past the boundary is noise. Concretely:

- A private method `requireNonNull`-ing arguments its only two callers construct three
  lines earlier.
- `if (list != null)` on a field initialised to `List.of()` and never reassigned to null.
- `catch (Exception e) { return defaultValue; }` "so it never crashes" — the crash was
  the information; the default is corruption with a calm face.
- Re-validating an email's format in the service, the mapper and the entity, when an
  `EmailAddress` record exists — three copies that will drift, none authoritative.
- Checking `assert x != null` _and_ throwing on null for the same parameter: pick one
  based on who supplies `x`.

The cost is not the CPU (a branch on non-null data is nearly free and may be eliminated
by the JIT — do not argue performance either way without a profile). The cost is that
readers can no longer tell which checks encode real risk, and that the noise checks are
never tested — the dead branches show up as uncovered lines and get cargo-culted into the
next method.

## Resource and parser budgets

Set limits from downstream capacity and protocol needs, not arbitrary “reasonable” constants:

- cap compressed and decompressed bytes, nesting depth, token/field count and per-field length;
- reject malformed byte sequences with a reporting decoder when silent replacement changes
  identity or signatures;
- use overflow-checked arithmetic before `new byte[count]`, collection pre-sizing or offsets;
- do not compile/cache attacker-cardinality regexes/schemas/classes indefinitely;
- ensure validation itself has bounded CPU/memory and honors request cancellation/deadlines;
- measure rejects by stable reason without logging full hostile payloads.

## When not to apply

- Do not sweep a codebase deleting "redundant" checks without tracing each one to the
  boundary that makes it redundant; the list above is exactly the set people delete
  wrongly. Delete in the same change that hardens the boundary, never speculatively.
- In safety-critical or long-lived-state systems (ledgers, stock levels), belt-and-braces
  re-verification before an irreversible write (an `assert` or an explicit invariant
  check before persisting) is a legitimate, deliberate redundancy — document it as such.
- Generated code and DTOs that exist only to be mapped: leave them dumb; validate in the
  mapper that produces the domain type, not by decorating the DTO.

## Authoritative references

- [Objects.requireNonNull API, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Objects.html#requireNonNull(T,java.lang.String)>)
- [JLS §14.10: The assert Statement](https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html#jls-14.10)
- [CharsetDecoder malformed-input actions](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/charset/CharsetDecoder.html)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
