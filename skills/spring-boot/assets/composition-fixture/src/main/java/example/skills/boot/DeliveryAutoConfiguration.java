package example.skills.boot;

import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnProperty(prefix = "acme.delivery", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(DeliveryProperties.class)
public final class DeliveryAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(DeliveryClient.class)
    DeliveryClient deliveryClient(DeliveryProperties properties) {
        return new DeliveryClient(properties);
    }

    @Bean
    @ConditionalOnMissingBean(Dispatcher.class)
    Dispatcher dispatcher(DeliveryClient client) {
        return new Dispatcher(client);
    }

    // An observable resource stand-in: this fixture does not open network connections.
    public static final class DeliveryClient implements AutoCloseable {
        private final DeliveryProperties properties;
        private final AtomicInteger closeCount = new AtomicInteger();

        public DeliveryClient(DeliveryProperties properties) {
            this.properties = properties;
        }

        public DeliveryProperties properties() {
            return properties;
        }

        public int closeCount() {
            return closeCount.get();
        }

        @Override
        public void close() {
            closeCount.incrementAndGet();
        }
    }

    public record Dispatcher(DeliveryClient client) {
    }
}
