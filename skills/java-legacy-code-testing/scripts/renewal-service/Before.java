// Before: RenewalCheck cannot be instantiated in a test at all.
// Two independent obstacles, and they need different techniques:
//   1. the constructor builds its own RateGateway, which connects at construction time
//   2. due() reads LocalDate.now(), so no assertion has a stable expected value
// Run: java Before.java  -- it fails at construction, before any assertion is reached.
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public class Before {

    record Policy(String id, LocalDate expiry) {}

    static final class RateGateway {
        RateGateway() {
            // Stands in for the real thing: a connection opened in the constructor.
            throw new IllegalStateException("RateGateway: cannot connect to policy-db");
        }

        double rateFor(String policyId) {
            return 1.0; // the real one queries policy-db
        }
    }

    static final class RenewalCheck {
        private final RateGateway rates = new RateGateway(); // obstacle 1

        List<String> due(List<Policy> policies) {
            LocalDate today = LocalDate.now(); // obstacle 2
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
        System.out.println("attempting the first line of any test: new RenewalCheck()");
        var service = new RenewalCheck();
        System.out.println("unreachable: " + service.due(List.of()));
    }
}
