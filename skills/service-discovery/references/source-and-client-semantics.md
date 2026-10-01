# Source and client semantics

Read when selecting a source or investigating a Java/Spring client's stale membership.
These mechanisms expose different contracts; their freshness knobs are not interchangeable.

## Trace the chain that the caller actually uses

Draw the path from the authoritative registration/configuration to the consumer's next
connection. Include replica/registry caches, DNS recursive/OS caches, Java or transport
resolvers, discovery-client caches, selection caches and connection pools where present.
For each stage record its update trigger, successful and failed refresh behavior,
maximum retained age, scope and owner. A sequential chain can compound delay; adding
configured TTLs is only a model when the refresh semantics and connection lifecycle make
that bound valid. Compare it with removal-to-last-new-request measurements.

Full snapshots need a scope: service, namespace, environment, region and any authorization
filter. An empty scoped response can mean no visible endpoints without proving that no
endpoint exists globally. Permission failure is a different outcome. Keep source revision,
local observation time and deployment/application version distinct. Do not merge two
authorities' numeric revisions or silently union a retired environment into a fallback.

For watches, a quiet stream does not prove it is live. Determine keepalive/progress semantics,
reconnect budget and when to refresh a full view. For polling, serialize/coalesce refreshes
or preserve the source's ordering so slow responses cannot undo newer removals. Refresh
attempts must fit a deadline and fleet retry budget; request-path callers should not all
start a new lookup when one cache entry expires.

## DNS and Java name resolution

DNS gives records with resolver semantics, not application instances with an API-wide
health or version contract. Identify whether the consumer supports A/AAAA only or also
SRV, and whether an answer represents a virtual service or individual replicas. Preserve
address-family behavior and the intended TLS name; replacing a URL hostname with a returned
IP may break identity even when the IP is reachable. Do not parse DNS record ordering as
a universal load-balancing policy.

For `java.net` in Java 21, positive, negative and stale address-cache policies use
`networkaddress.cache.ttl`, `networkaddress.cache.negative.ttl` and
`networkaddress.cache.stale.ttl`. They are security properties rather than ordinary `-D`
system properties. Positive/stale defaults can depend on implementation/configuration;
inspect the deployed JDK instead of promising a fixed duration. Other client resolvers
may have separate caches. A lookup refresh does not migrate an established connection.
See the [Java 21 networking properties contract](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/doc-files/net-properties.html).

Do not translate the example resolver's additive stale allowance directly into Java DNS
properties. In Java 21, when `networkaddress.cache.stale.ttl` exceeds
`networkaddress.cache.ttl`, the latter becomes the refresh interval within the former's
retention window. For example, values of 120 and 30 seconds respectively permit retaining
the positive result for 120 seconds when refresh fails, not 150 seconds. These illustrate
semantics, not recommended settings. Stale reuse requires a failed refresh; neither a
cache hit nor continued traffic proves successful source revalidation. See the
[Java 21 InetAddress cache contract](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/InetAddress.html).

Capture effective properties and client behavior in an isolated JVM before changing them.
Test creation, failure and later appearance of a name: unsuccessful lookup caching can
delay bootstrap recovery. Check the resolver's handling of NXDOMAIN, empty answer,
timeout and SERVFAIL instead of mapping every failure to "service absent". Avoid a
process-wide zero-TTL change unless its DNS load and recovery behavior meet the requirement.

## Kubernetes, only when already relevant

Normal Service DNS resolves to the Service IP; headless Service DNS exposes endpoint
addresses. Service DNS therefore does not always expose Pod churn to application DNS
caches. Inspect readiness publication and `publishNotReadyAddresses` before inferring
what a returned address means. See [Service and Pod DNS](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/).

Check for a bootstrap cycle: if readiness requires discovering peers, but peer DNS records
appear only after readiness, waiting longer or reducing cache TTLs cannot resolve it.
A separate headless Service with `publishNotReadyAddresses: true` can provide peer
bootstrap discovery while an ordinary Service retains client-traffic readiness filtering.
Choose this only when the peer protocol tolerates starting members, and test cold start
and member replacement; publishing an address does not make that member usable.

For an API consumer, use a maintained client/informer where suitable. Aggregate all
matching EndpointSlices, handle duplicate endpoints and deletions, and publish a coherent
view. A single slice is not the service's entire membership. Preserve namespace and Service
identity across deletion/recreation. Endpoint conditions are inputs to eligibility policy,
not proof of reachability from each client. See [EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/).

In particular, `publishNotReadyAddresses: true` forces the EndpointSlice `ready` condition
to true; checking that flag alone cannot recover the Pod's readiness. Preserve the Service
configuration and the `serving`/`terminating` conditions when handing membership to routing,
whose eligibility and drain policy must interpret them. Those conditions are stable since
Kubernetes 1.26; see the [1.34 condition contract](https://v1-34.docs.kubernetes.io/docs/concepts/services-networking/endpoint-slices/#conditions).

Use the installed API's list/watch protocol. In the
[Kubernetes 1.34 API contract](https://v1-34.docs.kubernetes.io/docs/reference/using-api/api-concepts/),
`resourceVersion` is opaque. The
[current API contract](https://kubernetes.io/docs/reference/using-api/api-concepts/#resource-versions)
documents 1.35+ ordering guarantees within the same API group/resource type, with
arbitrary-width decimal values and conditions for extension APIs. Do not parse every
resource version into a Java `long`, compare across resource types, or assume one
contract for every cluster. Follow source-supported continuity; expired watch history
(`410 Gone`) requires cache clearing and a fresh list/watch. If the application separately
retains a last-known view under a stale policy, label it stale and never use it as the
new watch's base. The toy ordered revisions in the Java example are not Kubernetes tokens.

## Spring integration: inspect the actual provider

The following API guidance was checked against Spring Cloud Commons documentation labeled
5.0.3 and Spring Cloud Netflix documentation labeled 5.0.2. Resolve the target Boot/Cloud
release train and provider versions first; do not copy it into a different baseline
without checking that version's contracts. No Spring runtime is bundled with this skill.

`DiscoveryClient.getInstances(serviceId)` exposes provider instances; it does not expose
a portable authoritative revision or freshness timestamp. `ServiceRegistry` handles
registration separately. `SimpleDiscoveryClient` can supply configured instances without
a registry. A load-balanced Spring HTTP client interprets the URI host as a service ID;
it needs the corresponding LoadBalancer integration. A plain client resolves an ordinary
host instead. `@EnableDiscoveryClient` is not generally required with a supported provider.
These contracts are documented in [Commons abstractions](https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons/common-abstractions.html).

Do not wrap `getInstances()` with a newly invented "fresh from source" timestamp: its
provider may return cached data. Inspect the concrete bean and refresh/empty/error semantics.
Keep plain external-URL builders and load-balanced service-ID builders explicitly qualified;
do not feed user-supplied URLs through service discovery. Keep logical service identity
separate from physical connection address and verify TLS handling on the chosen client.

Spring Cloud LoadBalancer has a separate instance cache. Its documentation advises
disabling that layer when the provider already caches, such as Eureka, to avoid double
caching. Supplier ordering and custom cache configuration affect behavior; inspect the
actual supplier chain before changing it. See [LoadBalancer caching](https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons/loadbalancer.html#loadbalancer-caching).

Partial configuration example, not a standalone application or an unconditional setting:

```yaml
# Use only after confirming the discovery provider already owns instance caching.
spring:
  cloud:
    loadbalancer:
      cache:
        enabled: false
```

With Eureka, registration, heartbeats, registry views and client fetches are separate
stages. A lease-renewal interval alone does not bound the caller's stale view. Application
health propagation is distinct from the heartbeat and must be configured deliberately.
See [Spring Cloud Netflix Eureka behavior](https://docs.spring.io/spring-cloud-netflix/reference/spring-cloud-netflix.html).
Inspect server eviction/self-preservation policy and effective client fetch configuration
before predicting crash removal. Preserve adequate defaults until evidence supports a
change. Test warm callers and cold starts against registry loss, then recovery; disabling
a second cache is not evidence that every request now sees authoritative membership.
