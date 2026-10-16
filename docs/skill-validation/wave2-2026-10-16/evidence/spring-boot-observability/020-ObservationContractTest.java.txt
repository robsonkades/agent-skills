package example.observability;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.observation.ObservationRegistry;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter;
import io.opentelemetry.sdk.trace.SpanProcessor;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.micrometer.tracing.test.autoconfigure.AutoConfigureTracing;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTracing
class ObservationContractTest {
    @LocalServerPort int port;
    @Autowired InMemorySpanExporter spans;
    @Autowired MeterRegistry meters;
    @Autowired ObservationRegistry observations;
    @Autowired ThreadPoolTaskExecutor applicationTaskExecutor;

    @Test
    void actualAsyncJourneyKeepsParentageAndCleansWorkerOnSuccessAndFailure() throws Exception {
        var rawWorker = applicationTaskExecutor.getThreadPoolExecutor();
        long workerId = rawWorker.submit(() -> Thread.currentThread().threadId()).get(5, TimeUnit.SECONDS);

        for (boolean fail : new boolean[] {false, true}) {
            spans.reset();
            int status = fail ? 502 : 200;
            long before = requestCount("/work/{user}", status);
            assertThat(get("/work/alice?fail=" + fail).statusCode()).isEqualTo(status);
            await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> {
                assertThat(spans.getFinishedSpanItems()).hasSize(3);
                assertThat(requestCount("/work/{user}", status)).isEqualTo(before + 1);
            });

            SpanData incoming = serverSpan("/work/");
            SpanData outgoing = spans.getFinishedSpanItems().stream()
                    .filter(span -> span.getKind() == SpanKind.CLIENT).findFirst().orElseThrow();
            SpanData downstream = serverSpan("/downstream/");
            assertThat(outgoing.getTraceId()).isEqualTo(incoming.getTraceId());
            assertThat(outgoing.getParentSpanId()).isEqualTo(incoming.getSpanId());
            assertThat(downstream.getTraceId()).isEqualTo(incoming.getTraceId());
            assertThat(downstream.getParentSpanId()).isEqualTo(outgoing.getSpanId());
            assertThat(meters.find("http.client.requests").tag("status", fail ? "503" : "200")
                    .timers()).hasSize(1);
            assertThat(meters.find("http.server.requests").tag("uri", "/work/{user}")
                    .tag("status", Integer.toString(status)).timers()).allSatisfy(timer ->
                    assertThat(timer.getId().getTag("outcome"))
                            .isEqualTo(fail ? "SERVER_ERROR" : "SUCCESS"));

            // Inspect the real reused worker without decorating this inspection: a new
            // capture could hide a previous leak. Pool size one makes reuse deliberate.
            assertThat(rawWorker.submit(observations::getCurrentObservation).get(5, TimeUnit.SECONDS)).isNull();
            assertThat(rawWorker.submit(() -> Thread.currentThread().threadId()).get(5, TimeUnit.SECONDS))
                    .isEqualTo(workerId);
        }
    }

    @Test
    void uriTemplatesKeepMetricDimensionsBoundedAndExcludeSecrets() throws Exception {
        long before = requestCount("/work/{user}", 200);
        int spansBefore = spans.getFinishedSpanItems().size();
        for (int i = 0; i < 12; i++) {
            assertThat(get("/work/person-" + i).statusCode()).isEqualTo(200);
        }
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> {
            assertThat(requestCount("/work/{user}", 200)).isEqualTo(before + 12);
            // Finish all three boundaries before another test resets the shared exporter.
            assertThat(spans.getFinishedSpanItems()).hasSize(spansBefore + 36);
        });
        assertThat(meters.find("http.server.requests").tag("uri", "/work/{user}")
                .tag("status", "200").timers()).hasSize(1);
        assertThat(meters.find("http.client.requests").tag("status", "200").timers()).hasSize(1);
        assertThat(meters.getMeters()).allSatisfy(meter ->
                assertThat(meter.getId().getTags()).allSatisfy(tag -> {
                    assertThat(tag.getKey()).doesNotContainIgnoringCase("secret")
                            .doesNotContainIgnoringCase("authorization");
                    assertThat(tag.getValue()).doesNotContain("person-", "secret-canary");
                }));
    }

    private long requestCount(String uri, int status) {
        return meters.find("http.server.requests").tag("uri", uri)
                .tag("status", Integer.toString(status)).timers().stream().mapToLong(Timer::count).sum();
    }

    private SpanData serverSpan(String route) {
        return spans.getFinishedSpanItems().stream().filter(span -> span.getKind() == SpanKind.SERVER
                && span.getName().contains(route)).findFirst().orElseThrow();
    }

    private HttpResponse<String> get(String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(8)).header("X-Secret", "secret-canary").GET().build();
        // An uninstrumented driver keeps test-client spans outside the application assertions.
        try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build()) {
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class LocalExport {
        @Bean InMemorySpanExporter exporter() { return InMemorySpanExporter.create(); }
        @Bean SpanProcessor processor(InMemorySpanExporter exporter) {
            return SimpleSpanProcessor.create(exporter);
        }
    }
}
