# Designing an AutoCloseable

## The exception semantics that decide the shape

The first block is pseudocode: its query-capable connection is not `java.sql.Connection`
(JDBC queries use Statement/PreparedStatement). Later blocks are partial Java 21 sketches;
supply imports, `LedgerLine`, fields and UTF-8 constant as required.

```java
// try-finally: the body's exception is lost if close() also throws
Connection c = pool.get();
try {
    return c.query(sql);          // throws SQLTimeoutException  <- the real cause
} finally {
    c.close();                    // throws SQLException          <- the one you see
}

// try-with-resources: the body's exception wins, close()'s is attached
try (Connection c = pool.get()) {
    return c.query(sql);          // SQLTimeoutException propagates
}                                 // close()'s exception is in getSuppressed()
```

Suppression is why the construct is not a convenience. Two further properties follow from
the desugaring, and both matter in review:

- Resources close in **reverse declaration order**, so a resource may depend on one declared
  before it.
- The generated `close` runs inside its own `try`, so a `close` that throws cannot skip the
  close of the earlier resources.

A close implementation must follow its documented durability semantics. Swallowing a flush/commit
failure can create false success; genuinely best-effort cleanup may record and continue. Let
material failure propagate and let try-with-resources establish primary/suppressed ordering.

## Ownership rules

| Shape                                                            | Who closes                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Method acquires it                                               | the method unless it explicitly transfers ownership                                |
| Method receives it as a parameter                                | caller by default; callee only under explicit consume/ownership-transfer contract  |
| Method returns it                                                | caller only for an ownership transfer; a borrowed view retains its existing owner  |
| Constructor receives it and the object's lifetime is bound to it | the object only if it takes ownership; a borrowing wrapper must preserve its owner |
| It came from a pool                                              | the borrower ends its lease under the pool's release/eviction contract             |

The rule that gets violated most is the second. A `void process(InputStream in)` that closes
`in` works fine until a caller wants to read a header first, or to process two sections of
the same stream, or wraps it in a `SequenceInputStream`. If a method genuinely consumes the
whole stream and the caller has nothing left to do with it, that belongs in the name
(`consumeAndClose`) and in the Javadoc, not in an assumption.

## Writing the class

```java
public final class LedgerExport implements AutoCloseable {
    private final BufferedWriter out;
    private boolean closed;                       // thread-confined; not synchronized

    private LedgerExport(BufferedWriter out) { this.out = out; }

    public static LedgerExport to(Path target) throws IOException {
        BufferedWriter out = Files.newBufferedWriter(target, UTF_8);   // acquired, not yet owned
        try {
            return new LedgerExport(out);                              // ownership transferred here
        } catch (RuntimeException | Error failure) {
            try {
                out.close();                                           // constructor failed: release
            } catch (Throwable closeFailure) {
                if (closeFailure != failure) failure.addSuppressed(closeFailure);
            }
            throw failure;
        }
    }

    public void write(LedgerLine line) throws IOException {
        if (closed) throw new IllegalStateException("export already closed");
        out.write(line.toCsv());
        out.newLine();
    }

    @Override public void close() throws IOException {
        if (closed) return;        // idempotent
        closed = true;             // set before the risky work, so a failed close is not retried blindly
        out.close();               // failure means completion/durability cannot be claimed
    }
}
```

Points that generalise:

- **Preserve the acquisition/construction failure.** The factory catches `Throwable` only during
  cleanup after an existing failure, so an unchecked close failure cannot replace the original.
  The identity guard avoids self-suppression if both paths throw the same exception object;
  this is not a general instruction to swallow errors or continue after failed acquisition.
- **Narrow the declared exception.** `close() throws Exception` propagates to every caller's
  catch clause. Declare `IOException`, or nothing at all when the close genuinely cannot fail.
- **Do not lose interruption through suppression.** `AutoCloseable` advises against throwing
  `InterruptedException` from `close`. For interruptible cleanup, define how interruption is
  preserved and what remains unreleased; merely wrapping or suppressing an exception after an
  interruptible wait cleared the flag can lose the signal. An interrupted wait does not prove
  completed release.
- **Idempotent where the contract permits.** Decorators and error paths can double-close;
  arbitrary `AutoCloseable` or reference-counted releases need their own protocol. This
  confined wrapper marks itself closed before release and does not blindly retry a failed close.
- **Specify post-close use.** This wrapper rejects writes with a named `IllegalStateException`.
  Preserve other APIs' actual post-close behavior; do not replace it with an accidental NPE.
- **Take ownership visibly.** A constructor or factory that will close what it was given must
  say so; a factory that opens its own resource must release it if construction then fails.
- **Say whether it is thread-safe.** A resource wrapper is usually confined to one thread and
  should say that rather than leave callers guessing; java-memory-model and the thread-safety
  contract rules apply as to any other shared object.

## Decorators and partially constructed chains

```java
try (var out = new BufferedWriter(new FileWriter(path))) { ... }
```

If the `BufferedWriter` constructor throws — allocation failure, or a decorator whose
constructor validates — the `FileWriter` is open and unreferenced. GC-driven cleanup, if any,
is not a deterministic release guarantee; file descriptors may exhaust first. Declare them separately:

```java
try (var raw = new FileWriter(path);
     var out = new BufferedWriter(raw)) { ... }          // raw closes even if wrapping fails
```

Double-close is fine for these `Closeable` implementations because their contract requires no
effect on a repeated close. Do not generalize this to arbitrary `AutoCloseable` or reference-counted
resources.

## Returning a resource to the caller

A method returning an open resource must distinguish a new ownership transfer from a borrowed
view of an existing owner. For a transfer, make three things clear:

1. Prefer an `AutoCloseable` return type (including `Stream`) so `try`-with-resources is
   available. Preserve an established explicit lease/release protocol when required.
2. The Javadoc states that the caller must close it — including for streams, where the
   requirement is invisible in the type.
3. Nothing partially opened leaks when the method throws after acquiring: acquire last, or
   close explicitly in the catch.

```java
/** @return lines of the export; the caller must close the stream. */
public Stream<String> lines() throws IOException {
    return Files.lines(target);      // holds an open file handle until closed
}
```

## Authoritative references

- [JLS §14.20.3: try-with-resources, Java SE 21](https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html#jls-14.20.3)
- [AutoCloseable contract, Java SE 21](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/AutoCloseable.html)
- [Closeable idempotence contract, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/io/Closeable.html)
- [JDBC Connection close/transaction contract, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.sql/java/sql/Connection.html#close()>)
- [Cleaner explicit release and automatic fallback, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ref/Cleaner.html)
