// After: two techniques, one per obstacle.
//   Extract Interface (Feathers p. 362) -- a NEW name for the interface, so the concrete
//     class keeps its own and every existing caller still compiles;
//   Parameterize Constructor (p. 379) -- the object seam, whose enabling point is the
//     constructor call.
// The old no-arg constructor is kept and delegates, so no caller of RenewalCheck changes
// either. Preserving signatures narrows the review; initialization, dispatch and timing still
// need a preservation argument. This example assumes the process default zone is stable.
// Run: java After.java
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

public class After {

    record Policy(String id, LocalDate expiry) {}

    // Extracted: only the method RenewalCheck actually calls, under a new name.
    interface Rates {
        double rateFor(String policyId);
    }

    // Unchanged, including its name. It still connects in its constructor.
    static final class RateGateway implements Rates {
        RateGateway() {
            throw new IllegalStateException("RateGateway: cannot connect to policy-db");
        }

        @Override
        public double rateFor(String policyId) {
            return 1.0;
        }
    }

    static final class RenewalCheck {
        private final Rates rates;
        private final Clock clock;

        // The seam.
        RenewalCheck(Rates rates, Clock clock) {
            this.rates = rates;
            this.clock = clock;
        }

        // Preserve Signatures. systemDefaultZone, not systemUTC: anything else would change
        // behaviour, and this step is not allowed to.
        RenewalCheck() {
            this(new RateGateway(), Clock.systemDefaultZone());
        }

        List<String> due(List<Policy> policies) {
            LocalDate today = LocalDate.now(clock);
            var out = new ArrayList<String>();
            for (Policy p : policies) {
                if (!p.expiry().isAfter(today.plusDays(30)) && rates.rateFor(p.id()) > 0) {
                    out.add(p.id());
                }
            }
            return out;
        }
    }

    public static void main(String[] args) {
        // The injected test path must not replace the original callers' acquisition path.
        try {
            new RenewalCheck();
            throw new AssertionError("default constructor bypassed RateGateway");
        } catch (IllegalStateException actual) {
            if (!"RateGateway: cannot connect to policy-db".equals(actual.getMessage())) {
                throw new AssertionError("default constructor changed the acquisition failure", actual);
            }
        }

        // Keep due() real. A constant answer alone would hide a wrong lookup key.
        var requestedIds = new ArrayList<String>();
        Rates stub = policyId -> {
            requestedIds.add(policyId);
            if (!policyId.equals("P1")) {
                throw new AssertionError("unexpected rate lookup: " + policyId);
            }
            return 1.0;
        };
        var clock = Clock.fixed(Instant.parse("2026-05-04T00:00:00Z"), ZoneOffset.UTC);

        var service = new RenewalCheck(stub, clock);

        var due = service.due(List.of(
                new Policy("P1", LocalDate.of(2026, 5, 15)),
                new Policy("P2", LocalDate.of(2026, 11, 1))));

        System.out.println("due = " + due);
        if (!due.equals(List.of("P1"))) {
            throw new AssertionError("expected [P1] but got " + due);
        }
        if (!requestedIds.equals(List.of("P1"))) {
            throw new AssertionError("expected one P1 lookup and no late-policy lookup: " + requestedIds);
        }
        var today = LocalDate.now(clock);
        var boundary = new RenewalCheck(id -> 1.0, clock).due(List.of(
                new Policy("CUT", today.plusDays(30)),
                new Policy("LATE", today.plusDays(31))));
        if (!boundary.equals(List.of("CUT"))) {
            throw new AssertionError("expected inclusive 30-day cutoff but got " + boundary);
        }
        if (!new RenewalCheck(id -> 0.0, clock)
                .due(List.of(new Policy("ZERO", today))).isEmpty()) {
            throw new AssertionError("zero-rate policy must not be due");
        }

        var failure = new IllegalStateException("rate lookup unavailable");
        Rates unavailable = id -> { throw failure; };
        var failingService = new RenewalCheck(unavailable, clock);
        if (!failingService.due(List.of(new Policy("LATE", today.plusDays(31)))).isEmpty()) {
            throw new AssertionError("late policy must be excluded without a rate lookup");
        }
        try {
            failingService.due(List.of(new Policy("DUE", today)));
            throw new AssertionError("expected the original rate lookup failure");
        } catch (IllegalStateException actual) {
            if (actual != failure) {
                throw new AssertionError("rate lookup failure was replaced", actual);
            }
        }
        System.out.println("OK: original construction failure, fixed-clock results, "
                + "lookup effects and failure propagation");
    }
}
