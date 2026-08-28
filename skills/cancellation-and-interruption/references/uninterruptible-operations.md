# Uninterruptible operations and what stops them

## The table to check the path against

| Blocking operation                                                   | Interrupt does what                                            | What actually stops it                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| `Thread.sleep`, `Object.wait`, `Thread.join`                         | throws `InterruptedException`                                  | interrupt                                  |
| `BlockingQueue.put/take/poll(t)`                                     | throws `InterruptedException`                                  | interrupt                                  |
| `CountDownLatch.await`, `Semaphore.acquire`, `Condition.await`       | throws `InterruptedException`                                  | interrupt                                  |
| `Future.get`, `ExecutorService.awaitTermination`                     | throws `InterruptedException`                                  | interrupt                                  |
| `HttpClient.send` (synchronous)                                      | throws `InterruptedException`                                  | interrupt                                  |
| `ReentrantLock.lock`                                                 | **nothing** — the flag stays set                               | `lockInterruptibly()` instead              |
| `Semaphore.acquireUninterruptibly`, `Condition.awaitUninterruptibly` | nothing, by contract                                           | nothing — do not use on a cancellable path |
| entering a `synchronized` block                                      | **nothing**                                                    | shorten the critical section               |
| `CompletableFuture.join()`                                           | **keeps waiting**, restores the flag on exit                   | `get()`, or completing the future          |
| `Socket` / `InputStream` reads (`java.io`)                           | **nothing**                                                    | `socket.close()` from another thread       |
| `FileInputStream.read` and friends                                   | **nothing**                                                    | close the stream                           |
| `FileChannel` / any `InterruptibleChannel`                           | throws `ClosedByInterruptException` **and closes the channel** | interrupt — once                           |
| JDBC `executeQuery`                                                  | driver-dependent; usually nothing                              | `setQueryTimeout` + `Statement.cancel()`   |
| a native (JNI/FFM) call                                              | nothing until it returns to Java                               | whatever the native API offers             |

The rows with "nothing" in the middle column are where a cancellation policy that looks
complete on paper silently stops working.

## `CompletableFuture.join()` is the trap in the middle of that table

```java
// get(): interruptible. It declares the exception because it can throw it.
String a = future.get();                                  // throws InterruptedException

// join(): waits through the interrupt, remembers it, restores the flag when it finally
// returns. Cancellation is not delivered — only deferred until the work completes anyway.
String b = future.join();
```

`join()` is convenient precisely because it does not force a checked exception, and that
convenience is what removes the cancellation point. On any path that must be cancellable use
`get()` — or better, do not have an unbounded wait at all (`get(timeout, unit)`, `orTimeout`).

## Closing the resource is the cancellation mechanism

For anything in `java.io` and for classic sockets there is no interrupt path. The only way to
release a thread blocked in `read()` is to close the thing it is reading.

```java
class CancellableFetch implements Runnable {
    private final Socket socket;

    @Override public void run() {
        try (var in = socket.getInputStream()) {
            readEverything(in);
        } catch (SocketException e) {         // this is what a close looks like from inside
            if (Thread.currentThread().isInterrupted()) return;  // expected: we were cancelled
            throw new UncheckedIOException(e);                   // unexpected: a real failure
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    void cancel() {
        closeQuietly(socket);                 // this is what wakes the blocked read
    }
}
```

Two consequences worth stating: the wake-up arrives as an ordinary `IOException`, so the task
needs a way to tell "cancelled" from "the peer died" — the interrupt flag is the usual carrier
— and the resource is destroyed rather than returned, so this is a connection-level event that
a pool has to be told about.

## `FileChannel` closes itself when you interrupt it

`FileChannel` is an `InterruptibleChannel`. Interrupting a thread blocked on it throws
`ClosedByInterruptException` **and leaves the channel closed**, which surprises code that
expected to retry the read. If a file handle must survive cancellation, do the I/O on a thread
that is never interrupted and cancel by other means, or treat reopening as part of the
recovery path.

## Cancelling a database call

```java
try (PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setQueryTimeout(3);          // seconds; enforced by driver or server, not by the JVM
    ...
}
```

`setQueryTimeout` is the only portable bound, and it is enforced outside the JVM — which is
why it works when nothing else does, and also why a driver may implement it by opening a
second connection. `Statement.cancel()` from another thread is the explicit form and is
equally driver-dependent. Interrupting the calling thread typically does nothing at all. That
is why a request deadline that only interrupts leaves database work running long after the
client gave up, still holding the connection the next request needs.

## Cancelling an HTTP call

```java
CompletableFuture<HttpResponse<String>> f =
        client.sendAsync(request, BodyHandlers.ofString());

f.orTimeout(2, TimeUnit.SECONDS);   // bounds the CALLER; not by itself a stop for the exchange
```

Prefer `HttpRequest.newBuilder().timeout(Duration)`, which bounds the exchange itself, and the
synchronous `send()` on a virtual thread, which is interruptible. When a response is abandoned
rather than consumed, the connection may not return to the pool until the server has finished
writing — an abandoned call is not a free call.

## Proving cancellation released something

A test that asserts only "the future is cancelled" tests the wrapper. Assert the effect:

```java
@Test
void cancellingReleasesTheConnection() throws Exception {
    int before = pool.getIdleConnections();
    Future<?> f = executor.submit(this::slowQuery);
    awaitStarted();

    f.cancel(true);

    await().atMost(Duration.ofSeconds(2))          // the bound is the point of the test
           .untilAsserted(() -> assertEquals(before, pool.getIdleConnections()));
}
```

The same shape works for a file handle, a lease or a permit. If the resource does not come
back, the cancellation did not happen — whatever the `Future` says.

## Reviewer checklist

- [ ] Every blocking call on a cancellable path checked against the table above
- [ ] No `join()` on a path that must respond to cancellation
- [ ] `lockInterruptibly()` wherever a lock is taken on a cancellable path
- [ ] Classic socket and stream reads have a close-based cancellation, and the task can tell
      cancellation from failure
- [ ] Every JDBC statement on a request path sets `setQueryTimeout`
- [ ] Every HTTP request has a request-level timeout, not only a caller-side one
- [ ] A test asserts the released resource, not the cancelled future
