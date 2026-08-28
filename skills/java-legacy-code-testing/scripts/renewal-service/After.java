// After: two techniques, one per obstacle.
//   Extract Interface (Feathers p. 362) -- a NEW name for the interface, so the concrete
//     class keeps its own and every existing caller still compiles;
//   Parameterize Constructor (p. 379) -- the object seam, whose enabling point is the
//     constructor call.
// The old no-arg constructor is kept and delegates, so no caller of RenewalCheck changes
// either. Both halves are Preserve Signatures (ch. 23, pp. 310-317), and that is what makes
// the step safe with no test in place.
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
        // Stands in for the test: a hand-written stub, no mocking framework.
        Rates stub = policyId -> 1.0;
        var clock = Clock.fixed(Instant.parse("2026-05-04T00:00:00Z"), ZoneOffset.UTC);

        var service = new RenewalCheck(stub, clock);

        var due = service.due(List.of(
                new Policy("P1", LocalDate.of(2026, 5, 15)),
                new Policy("P2", LocalDate.of(2026, 11, 1))));

        System.out.println("due = " + due);
        if (!due.equals(List.of("P1"))) {
            throw new AssertionError("expected [P1] but got " + due);
        }
        System.out.println("same answer on every machine, on every date");
    }
}
