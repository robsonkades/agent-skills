import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import java.util.function.Predicate;

/** Educational, one-service snapshot cache; not a DNS, Spring or registry adapter. */
public final class SnapshotResolverExample {
    enum Policy { FRESH_ONLY, BOUNDED_STALE }
    enum State { UNINITIALIZED, FRESH, EMPTY, STALE, EXPIRED }

    record View(State state, Set<URI> endpoints, long revision) {
        View {
            endpoints = Set.copyOf(endpoints);
        }
    }

    private record Snapshot(long revision, Set<URI> endpoints, long observedAt) {}

    static final class Resolver {
        private final String epoch;
        private final long positiveTtl;
        private final long negativeTtl;
        private final long maximumAge;
        private final int maximumEndpoints;
        private final LongSupplier ticker;
        private final Predicate<URI> allowedDestination;
        private Snapshot current;

        Resolver(String epoch, Duration positiveTtl, Duration negativeTtl,
                 Duration staleAllowance, int maximumEndpoints,
                 LongSupplier ticker, Predicate<URI> allowedDestination) {
            this.epoch = Objects.requireNonNull(epoch);
            this.positiveTtl = positiveTtl.toNanos();
            this.negativeTtl = negativeTtl.toNanos();
            long staleNanos = staleAllowance.toNanos();
            this.maximumAge = Math.addExact(this.positiveTtl, staleNanos);
            if (epoch.isBlank() || this.positiveTtl <= 0 || this.negativeTtl <= 0
                    || staleNanos < 0 || maximumAge >= Long.MAX_VALUE / 2
                    || this.negativeTtl >= Long.MAX_VALUE / 2 || maximumEndpoints <= 0) {
                throw new IllegalArgumentException("Invalid bounded cache policy");
            }
            this.maximumEndpoints = maximumEndpoints;
            this.ticker = Objects.requireNonNull(ticker);
            this.allowedDestination = Objects.requireNonNull(allowedDestination);
        }

        /**
         * The caller authenticates this source and supplies a complete scoped snapshot.
         * revalidated may be true only for an authoritative re-read, never a cache replay.
         * The predicate is a bounded pure function; no I/O belongs inside this method.
         */
        synchronized boolean accept(String sourceEpoch, long revision, List<URI> endpoints,
                                    boolean revalidated) {
            if (!epoch.equals(sourceEpoch) || revision < 0) {
                throw new IllegalArgumentException("Unexpected authority epoch or revision");
            }
            if (endpoints.size() > maximumEndpoints) {
                throw new IllegalArgumentException("Too many endpoints");
            }
            Set<URI> copy = Set.copyOf(endpoints);
            if (!copy.stream().allMatch(allowedDestination)) {
                throw new IllegalArgumentException("Destination outside service policy");
            }
            if (current != null) {
                if (revision < current.revision()) {
                    return false;
                }
                if (revision == current.revision()) {
                    if (!copy.equals(current.endpoints())) {
                        throw new IllegalArgumentException("Conflicting snapshot revision");
                    }
                    if (!revalidated) {
                        return false;
                    }
                }
            }
            current = new Snapshot(revision, copy, ticker.getAsLong());
            return true;
        }

        synchronized View resolve(Policy policy) {
            Objects.requireNonNull(policy);
            if (current == null) {
                return new View(State.UNINITIALIZED, Set.of(), -1);
            }
            long age = ticker.getAsLong() - current.observedAt();
            // Defensive failure for a broken ticker contract; do not manufacture freshness.
            if (age < 0) {
                return new View(State.EXPIRED, Set.of(), current.revision());
            }
            boolean empty = current.endpoints().isEmpty();
            long ttl = empty ? negativeTtl : positiveTtl;
            if (age < ttl) {
                return new View(empty ? State.EMPTY : State.FRESH,
                        current.endpoints(), current.revision());
            }
            if (!empty && policy == Policy.BOUNDED_STALE && age < maximumAge) {
                return new View(State.STALE, current.endpoints(), current.revision());
            }
            // Retain the revision watermark internally so old responses cannot resurrect it.
            return new View(State.EXPIRED, Set.of(), current.revision());
        }
    }

    private static final URI A = URI.create("https://a.catalog.internal.example:8443");
    private static final URI B = URI.create("https://b.catalog.internal.example:8443");
    private static final Set<URI> ALLOWED = Set.of(A, B);
    private static int checks;

    private static Resolver resolver(AtomicLong clock) {
        // Nanoseconds make deterministic boundary checks compact; these are not operational TTLs.
        return new Resolver("catalog/prod/epoch-1", Duration.ofNanos(10),
                Duration.ofNanos(3), Duration.ofNanos(5), 2, clock::get, ALLOWED::contains);
    }

    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void rejected(Runnable action, String message) {
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            checks++;
            return;
        }
        throw new AssertionError(message);
    }

    public static void main(String[] args) throws Exception {
        AtomicLong clock = new AtomicLong();
        Resolver resolver = resolver(clock);
        check(resolver.resolve(Policy.BOUNDED_STALE).state() == State.UNINITIALIZED,
                "Cold start must not invent endpoints");

        List<URI> input = new ArrayList<>(List.of(A));
        check(resolver.accept("catalog/prod/epoch-1", 1, input, false), "Initial snapshot");
        input.clear();
        check(resolver.resolve(Policy.FRESH_ONLY).endpoints().equals(Set.of(A)),
                "Caller mutation must not affect the snapshot");
        try {
            resolver.resolve(Policy.FRESH_ONLY).endpoints().clear();
            throw new AssertionError("Returned endpoints must be immutable");
        } catch (UnsupportedOperationException expected) {
            checks++;
        }
        clock.set(9);
        check(resolver.resolve(Policy.FRESH_ONLY).state() == State.FRESH, "Before TTL");
        check(!resolver.accept("catalog/prod/epoch-1", 1, List.of(A), false),
                "A replay must not renew age");
        clock.set(10);
        check(resolver.resolve(Policy.FRESH_ONLY).state() == State.EXPIRED,
                "Fresh-only expires at TTL");
        check(resolver.resolve(Policy.BOUNDED_STALE).state() == State.STALE,
                "Different operation policy changes the outcome");
        clock.set(15);
        // A source failure causes no accept call; repeated reads must not extend age.
        for (int i = 0; i < 3; i++) {
            check(resolver.resolve(Policy.BOUNDED_STALE).state() == State.EXPIRED,
                    "Stale allowance is finite even if the source keeps failing");
        }
        check(resolver.accept("catalog/prod/epoch-1", 1, List.of(A), true),
                "Explicit authoritative revalidation can renew the unchanged view");
        check(resolver.resolve(Policy.FRESH_ONLY).state() == State.FRESH, "Revalidated view");

        check(resolver.accept("catalog/prod/epoch-1", 3, List.of(), false),
                "Authoritative removal must replace positive membership");
        check(!resolver.accept("catalog/prod/epoch-1", 2, List.of(B), true),
                "Delayed response must not undo removal");
        check(resolver.resolve(Policy.BOUNDED_STALE).state() == State.EMPTY,
                "Removal must never fall back to old endpoints");
        clock.set(18);
        check(resolver.resolve(Policy.BOUNDED_STALE).state() == State.EXPIRED,
                "Negative result must expire at its own boundary");
        check(!resolver.accept("catalog/prod/epoch-1", 2, List.of(A), false),
                "Expiry must retain the revision watermark");

        rejected(() -> resolver.accept("catalog/prod/epoch-1", 3, List.of(A), true),
                "Same revision with different membership must fail");
        rejected(() -> resolver.accept("catalog/prod/old-epoch", 100, List.of(A), false),
                "An old authority must not replace the current view");
        rejected(() -> resolver.accept("catalog/prod/epoch-1", 4,
                List.of(URI.create("http://169.254.169.254/latest/meta-data")), false),
                "A hostile link-local destination must be rejected");
        rejected(() -> resolver.accept("catalog/prod/epoch-1", 4,
                List.of(URI.create("https://a.catalog.test.example:8443")), false),
                "An endpoint from another environment must be rejected");
        rejected(() -> resolver.accept("catalog/prod/epoch-1", 4,
                List.of(A, B, A), false), "Input size is bounded before deduplication");
        check(resolver.resolve(Policy.FRESH_ONLY).revision() == 3,
                "Rejected records must not corrupt the accepted snapshot");
        check(resolver.accept("catalog/prod/epoch-1", 4, List.of(B), false),
                "Recovery must accept a new authoritative snapshot");
        check(resolver.resolve(Policy.FRESH_ONLY).endpoints().equals(Set.of(B)),
                "Recovery should expose only the new member");

        // Real racing calls exercise atomic comparison/publication, without sleeps.
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(4)) {
            List<Future<?>> futures = new ArrayList<>();
            for (long revision = 5; revision <= 36; revision++) {
                long value = revision;
                futures.add(executor.submit(() -> {
                    start.await();
                    resolver.accept("catalog/prod/epoch-1", value,
                            List.of(value % 2 == 0 ? B : A), false);
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> future : futures) {
                future.get(5, TimeUnit.SECONDS);
            }
        }
        View winner = resolver.resolve(Policy.FRESH_ONLY);
        check(winner.revision() == 36 && winner.endpoints().equals(Set.of(B)),
                "Maximum revision and its complete snapshot must win concurrent publication");
        clock.set(33);
        check(resolver.resolve(Policy.BOUNDED_STALE).state() == State.EXPIRED,
                "Concurrent publication must not make the snapshot immortal");
        System.out.println("PASS: " + checks + " snapshot resolver checks");
    }
}
