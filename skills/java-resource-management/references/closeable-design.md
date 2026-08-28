# Designing an AutoCloseable

## The exception semantics that decide the shape

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

Anything logged and swallowed inside a `close` implementation destroys this: the caller now
believes the operation succeeded. Let `close` throw, and let the construct decide.

## Ownership rules

| Shape                                                            | Who closes                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Method acquires it                                               | the method, in `try`-with-resources                                           |
| Method receives it as a parameter                                | the caller — never the method                                                 |
| Method returns it                                                | the caller, and the Javadoc must say so                                       |
| Constructor receives it and the object's lifetime is bound to it | the object, in its own `close` — and it must document that it takes ownership |
| It came from a pool                                              | the borrower, by `close()`, which returns rather than destroys                |

The rule that gets violated most is the second. A `void process(InputStream in)` that closes
`in` works fine until a caller wants to read a header first, or to process two sections of
the same stream, or wraps it in a `SequenceInputStream`. If a method genuinely consumes the
whole stream and the caller has nothing left to do with it, that belongs in the name
(`consumeAndClose`) and in the Javadoc, not in an assumption.

## Writing the class

```java
public final class LedgerExport implements AutoCloseable {
    private final BufferedWriter out;
    private boolean closed;                       // guarded by the instance; not thread-safe by design

    private LedgerExport(BufferedWriter out) { this.out = out; }

    public static LedgerExport to(Path target) throws IOException {
        BufferedWriter out = Files.newBufferedWriter(target, UTF_8);   // acquired, not yet owned
        try {
            return new LedgerExport(out);                              // ownership transferred here
        } catch (RuntimeException e) {
            out.close();                                               // constructor failed: release
            throw e;
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
        out.close();               // flush happens here; a failure here means the export is incomplete
    }
}
```

Points that generalise:

- **Narrow the declared exception.** `close() throws Exception` propagates to every caller's
  catch clause. Declare `IOException`, or nothing at all when the close genuinely cannot fail.
- **Idempotent, and cheap on the second call.** Decorators, error paths and pools all
  double-close.
- **A closed object rejects use.** `IllegalStateException` with the resource named, not an
  NPE from a nulled field three frames deeper.
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
constructor validates — the `FileWriter` is open and unreferenced. It closes only when the
garbage collector eventually gets to it, which under load is exactly when file descriptors
are already scarce. Declare them separately:

```java
try (var raw = new FileWriter(path);
     var out = new BufferedWriter(raw)) { ... }          // raw closes even if wrapping fails
```

Double-close is fine here precisely because `close` is idempotent: `out.close()` closes
`raw`, then `raw.close()` is a no-op.

## Returning a resource to the caller

A method that returns an open resource is transferring ownership, and three things must be
true:

1. The return type is `AutoCloseable` (or a `Stream` that holds one) so `try`-with-resources
   is available at the call site.
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
