# SLIs, availability definitions and error budgets

## The three terms, kept apart

| Term | What it is                                            | Who it binds        | Consequence of breaching   |
| ---- | ----------------------------------------------------- | ------------------- | -------------------------- |
| SLI  | A measurement: good / valid, or a ratio over a window | Nobody              | It is just a number        |
| SLO  | An internal target on that SLI                        | The engineering org | Budget policy takes effect |
| SLA  | An external commitment                                | The company         | Money, credits, contract   |

The SLO is set **stricter than the SLA, with the gap sized as detection-plus-response time**.
If the SLO equals the SLA, the alert that says "you are about to breach" fires at the same
instant as the breach.

## Choosing the indicator

Ask what the user notices, in the user's words, and then find the closest thing you can count:

| The user says            | SLI                                                                  | Measured at     |
| ------------------------ | -------------------------------------------------------------------- | --------------- |
| "It's down"              | successful responses / valid requests                                | Edge or gateway |
| "It's slow"              | requests faster than a threshold / valid requests                    | Edge or gateway |
| "My order didn't appear" | orders visible in the read model within N seconds / orders accepted  | Application     |
| "The report is stale"    | pipeline runs completed within the freshness window / scheduled runs | Pipeline        |

Two properties make an SLI usable:

- **Measured where the user is.** The application's own counter cannot record a request that
  never reached it — a load-balancer misconfiguration, a full connection backlog, a crashed
  pod — which is precisely the total-outage case. Availability belongs at the edge.
- **Expressed as a ratio of counts.** "Proportion of requests faster than 300 ms" is a counter
  ratio, so it aggregates correctly across instances and across windows. A percentile SLI does
  not aggregate at all (`latency-statistics`), which makes a fleet-wide or month-long value
  either wrong or expensive. Choose the threshold from what the user notices, not from the
  current p99.

## The availability definition, as decisions

Write each of these down. An SLO whose definition is implicit is renegotiated during every
incident review.

| Decision           | Options                                                              | Guidance                                                                                                                         |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Window             | Rolling 28/30 days, or calendar month                                | Rolling avoids a month boundary that erases a bad week; calendar aligns with an SLA                                              |
| Good event         | 2xx and 3xx; sometimes 4xx too                                       | State the list of codes, not "successful"                                                                                        |
| Bad event          | 5xx, timeouts, connection failures                                   | A timeout at the edge is bad even with no status code                                                                            |
| 4xx                | Usually excluded from bad                                            | Counting them lets a broken client breach your SLO; but then your own bad validation is invisible — cover it with a business SLI |
| Shed 429 / 503     | A separate SLI                                                       | Working as designed, not breakage; see `rate-limiting-and-load-shedding`                                                         |
| Valid event        | Excludes health checks, synthetic probes, load tests, and often bots | Otherwise a probe's volume dilutes or distorts the ratio                                                                         |
| Degraded responses | Explicitly good or bad                                               | A cached-fallback answer is a policy choice; decide once                                                                         |

The counter that feeds the SLI must be tagged so the classification is derivable without a
join. One bounded tag, decided at the point the outcome is known:

```java
Counter.builder("http.server.outcomes")
       .tag("class", outcome.name())   // SUCCESS | CLIENT_ERROR | SERVER_ERROR | SHED
       .register(registry).increment();
```

Keeping `SHED` distinct from `SERVER_ERROR` is the whole point: the same 503 means two
different things depending on who produced it, and no later query can tell them apart.

## Error budget arithmetic

Time-based, on a 30-day window of 43,200 minutes:

| Target  | Budget / 30 days | / 7 days  | / 24 h   |
| ------- | ---------------- | --------- | -------- |
| 99%     | 432 min (7.2 h)  | 100.8 min | 14.4 min |
| 99.5%   | 216 min (3.6 h)  | 50.4 min  | 7.2 min  |
| 99.9%   | 43.2 min         | 10.1 min  | 1.44 min |
| 99.95%  | 21.6 min         | 5.04 min  | 43.2 s   |
| 99.99%  | 4.32 min         | 60.5 s    | 8.64 s   |
| 99.999% | 25.9 s           | 6.05 s    | 0.86 s   |

Request-based, which is the form the alerting actually uses:

```text
budget (in bad requests) = (1 − target) × valid requests in the window
```

At 99.9% and 50 million requests a month, that is 50,000 bad requests. Note how differently
the two forms behave: a five-minute outage at 3 a.m. costs far fewer requests than five
minutes at peak, and the request-based form is the one that matches user harm.

Three consequences worth stating out loud:

- **99.9% monthly leaves no room for a single bad deploy.** One 20-minute rollback is 46% of
  the budget. If the team deploys twice a day, the target and the release process are in
  conflict, and one of them has to move.
- **The budget is a decision tool, not a report.** Budget remaining: ship, experiment, run the
  chaos test. Budget exhausted: the pre-agreed policy takes effect — typically a freeze on
  feature releases until it recovers, with reliability work taking priority. Agree the policy
  _before_ it triggers; negotiating it in the week it fires is how SLOs die.
- **100% is a demand to stop shipping.** Every change carries risk, so a target with no budget
  is a target met only by making no changes. Choosing 99.9 over 99.99 is choosing how fast the
  team is allowed to move, which makes it a business decision with an engineering input rather
  than the reverse.
