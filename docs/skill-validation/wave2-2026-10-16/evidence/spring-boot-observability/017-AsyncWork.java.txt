package example.observability;

import java.util.concurrent.CompletableFuture;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class AsyncWork {
    private final RestClient client;

    public AsyncWork(RestClient.Builder builder) {
        this.client = builder.build();
    }

    @Async("applicationTaskExecutor")
    public CompletableFuture<String> fetch(int port, String user, boolean fail) {
        String result = client.get()
                .uri("http://127.0.0.1:" + port + "/downstream/{user}?fail={fail}", user, fail)
                .retrieve().body(String.class);
        return CompletableFuture.completedFuture(result);
    }
}
