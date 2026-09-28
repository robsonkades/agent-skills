package example.skills.boot;

import java.time.Duration;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("acme.delivery")
public record DeliveryProperties(
        @DefaultValue("8") @Min(1) @Max(256) int parallelism,
        @DefaultValue("2s") @NotNull Duration timeout) {

    @AssertTrue(message = "timeout must be positive")
    public boolean isTimeoutPositive() {
        return timeout != null && !timeout.isNegative() && !timeout.isZero();
    }
}
