# Sizing Arithmetic

Use arithmetic to make assumptions inspectable. Do not use it to infer a latency
distribution that was not measured.

## 1. Define one workload unit

Let:

- \(\lambda_o(t)\): externally offered work per second;
- \(\lambda_a(t)\): admitted work per second;
- \(X_u(t)\): successfully completed useful work per second;
- \(a_j\): demand on resource/dependency \(j\) per admitted unit;
- \(C_j\): usable capacity of resource/dependency \(j\) in the same time window.

Retries are attempts, not new useful work. If a useful operation makes \(A\) attempts on
average, attempted rate is approximately \(A\lambda_a\); derive \(A\) from observed
retry policy and outcomes rather than assuming independence.

For a serial resource with stable demand, a necessary condition is:

\[
a_j\lambda_a < C_j
\]

This is not sufficient for an SLO: variability, batching, skew, priorities and queue
topology still matter.

## 2. Build the empirical envelope

For scenario \(s\) and configuration \(c\), define a pass predicate over a complete
evaluation window:

\[
P_{s,c}(\lambda)=
P(\text{latency SLO}) \land
P(\text{error SLO}) \land
P(\text{resource guardrails}) \land
P(\text{stable useful throughput})
\]

If tested point \(\lambda_k\) passes and the next point \(\lambda_{k+1}\) fails, report:

\[
K_{s,c} \in [\lambda_k,\lambda_{k+1})
\]

provided load increased monotonically and the failure is reproducible. Otherwise report
the observed points without inventing an interval. Repeat near the boundary and attach a
confidence interval or run-level distribution to the pass rate.

The configuration is feasible for target demand path \(D_s(t)\) only when its measured
envelope and transition behavior cover that path. A steady-state QPS comparison cannot
prove burst feasibility.

## 3. Enumerate configurations and scenarios

| configuration |       normal peak | rollout | zone/node loss | dependency degraded | burst/recovery |        cost |
| ------------- | ----------------: | ------: | -------------: | ------------------: | -------------: | ----------: |
| 6 × 2 CPU     | pass/fail/unknown |       … |              … |                   … |              … | dated basis |
| 8 × 2 CPU     |                 … |       … |              … |                   … |              … |           … |
| 4 × 4 CPU     |                 … |       … |              … |                   … |              … |           … |

Select only among rows that pass all required scenarios. “Unknown” is not “pass.” If a
model interpolates an untested cell, mark it predicted and validate it before approval.

## 4. Survivorship arithmetic

Let replicas be placed across failure domains \(d\), with warm useful capacity
\(k_{c,d}\) in the target scenario. After failure set \(F\):

\[
K_{survive}(F)=\sum_{d\notin F}k_{c,d}
\]

Require the **scenario-tested** survivors to support redistributed demand and dependency
state. Do not compute \(k_{c,d}\) as replicas times a nominal per-pod QPS when load
balance, shared resources or correlated warmup invalidate linearity.

For a rollout with \(U\) unavailable replicas and \(S\) surge replicas, account
separately for old replicas receiving traffic, replicas not ready, ready replicas below
warm capacity, placement/quota preventing surge and mixed-version effects. “N+2” is a
topology example, not a universal rule.

## 5. Reaction-time and backlog bounds

For a simplified fluid queue with admitted arrival \(\lambda(t)\) and useful service
capacity \(\mu(t)\):

\[
B(t)=\max\left(0, B(0)+\int_0^t[\lambda(u)-\mu(u)]du\right)
\]

This provides a backlog estimate while an autoscaler reacts. Test whether observed queue
age stays inside the deadline budget. The model assumes a common fluid queue and
work-conserving service; partitioning, priorities, abandonment and variable cost require
simulation or measurement. Do not conclude p99 from \(B/\lambda\).

## 6. Resource-demand checks

For a stable interval:

\[
D_{cpu}=\frac{\text{CPU seconds consumed}}{\text{successful units}}
\qquad
X_u \le \frac{C_{cpu}}{D_{cpu}}
\]

This is a necessary CPU ceiling while demand remains stable. Repeat for database calls,
connection occupancy time, bytes, broker operations or licence tokens.

Connection concurrency is governed by occupancy:

\[
L_{db}=\lambda_{db}W_{db}
\]

where quantities are consistently scoped long-run averages. Include transactions, fan-out,
retries and hold time.

## 7. USL use and limits

For relative throughput capacity:

\[
C(N)=\frac{N}{1+\alpha(N-1)+\beta N(N-1)}
\]

When \(\beta>0\) and \(\alpha<1\), the continuous stationary point is:

\[
N^*=\sqrt{\frac{1-\alpha}{\beta}}
\]

It is not an allowed replica count or a safety boundary. Carry coefficient uncertainty,
evaluate integer neighbors, and validate. Otherwise do not report a finite peak.

Never calculate:

\[
p99_{fleet}=p99_{single}+\frac{-\ln(0.01)}{\mu-\lambda}
\]

unless a validated queue model identifies those quantities and their joint composition. A
fleet is not one exponential server; even valid component percentiles cannot generally be
added.

## 8. Sanity gates

Reject or qualify a result when:

- offered, admitted and successful load are conflated;
- workload mix or payload distribution differs from the target;
- the selected configuration or failure topology was not tested;
- confidence intervals overlap the decision boundary materially;
- extrapolation crosses a resource, quota or topology change;
- headroom double-counts failure reserve, forecast uncertainty and autoscaling reserve;
- useful throughput falls under overload but attempted QPS is counted;
- cost excludes warm standby or required failure-domain capacity.
