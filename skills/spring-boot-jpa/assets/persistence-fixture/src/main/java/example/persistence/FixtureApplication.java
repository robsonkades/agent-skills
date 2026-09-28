package example.persistence;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication(proxyBeanMethods = false)
@EnableJpaAuditing(dateTimeProviderRef = "auditTimeProvider")
public class FixtureApplication {
    @Bean
    Clock applicationClock() {
        return Clock.systemUTC();
    }

    @Bean
    DateTimeProvider auditTimeProvider(Clock clock) {
        return () -> Optional.of(Instant.now(clock));
    }
}
