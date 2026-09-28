package example.skills.boot;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.context.properties.ConfigurationPropertiesBindException;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

import example.skills.boot.DeliveryAutoConfiguration.DeliveryClient;
import example.skills.boot.DeliveryAutoConfiguration.Dispatcher;

import static org.assertj.core.api.Assertions.assertThat;

class CompositionTests {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(DeliveryAutoConfiguration.class));

    @Test
    void defaultsBindAndDispatcherUsesManagedClient() {
        runner.run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(DeliveryClient.class);
            DeliveryClient client = context.getBean(DeliveryClient.class);
            assertThat(client.properties().parallelism()).isEqualTo(8);
            assertThat(client.properties().timeout()).isEqualTo(Duration.ofSeconds(2));
            assertThat(context.getBean(Dispatcher.class).client()).isSameAs(client);
        });
    }

    @Test
    void explicitEnableUsesBoundValues() {
        runner.withPropertyValues("acme.delivery.enabled=true", "acme.delivery.parallelism=12",
                "acme.delivery.timeout=350ms").run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(DeliveryClient.class);
                    assertThat(context.getBean(DeliveryClient.class).properties())
                            .isEqualTo(new DeliveryProperties(12, Duration.ofMillis(350)));
                });
    }

    @Test
    void disabledFeatureDoesNotCreateResourcesOrValidateInactiveProperties() {
        runner.withPropertyValues("acme.delivery.enabled=false", "acme.delivery.parallelism=0")
                .run(context -> assertThat(context).hasNotFailed()
                        .doesNotHaveBean(DeliveryClient.class).doesNotHaveBean(Dispatcher.class)
                        .doesNotHaveBean(DeliveryProperties.class));
    }

    @Test
    void customBeanMakesDefaultBackOff() {
        runner.withUserConfiguration(CustomClientConfiguration.class).run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(DeliveryClient.class);
            assertThat(context).doesNotHaveBean("deliveryClient");
            assertThat(context.getBean(DeliveryClient.class)).isSameAs(context.getBean("customClient"));
            assertThat(context.getBean(Dispatcher.class).client()).isSameAs(context.getBean("customClient"));
        });
    }

    @Test
    void invalidParallelismFailsBinding() {
        runner.withPropertyValues("acme.delivery.parallelism=0").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasCauseInstanceOf(ConfigurationPropertiesBindException.class);
        });
    }

    @Test
    void zeroDurationFailsValidation() {
        runner.withPropertyValues("acme.delivery.timeout=0s").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasCauseInstanceOf(ConfigurationPropertiesBindException.class);
        });
    }

    @Test
    void malformedDurationFailsBinding() {
        runner.withPropertyValues("acme.delivery.timeout=tomorrow").run(context -> assertThat(context).hasFailed());
    }

    @Test
    void contextCloseInvokesManagedResourceCloseExactlyOnce() {
        AtomicReference<DeliveryClient> observed = new AtomicReference<>();
        runner.run(context -> {
            observed.set(context.getBean(DeliveryClient.class));
            assertThat(observed.get().closeCount()).isZero();
        });
        assertThat(observed.get().closeCount()).isEqualTo(1);
    }

    @Test
    void fullConfigurationInterceptsDirectBeanMethodCall() {
        new ApplicationContextRunner().withUserConfiguration(FullConfiguration.class).run(context -> {
            assertThat(context.getBean(Dispatcher.class).client()).isSameAs(context.getBean(DeliveryClient.class));
        });
    }

    @Test
    void liteConfigurationDirectCallCreatesUnmanagedDuplicate() {
        AtomicReference<DeliveryClient> unmanaged = new AtomicReference<>();
        new ApplicationContextRunner().withUserConfiguration(BrokenLiteConfiguration.class).run(context -> {
            DeliveryClient duplicate = context.getBean(Dispatcher.class).client();
            unmanaged.set(duplicate);
            assertThat(duplicate).isNotSameAs(context.getBean(DeliveryClient.class));
        });
        assertThat(unmanaged.get().closeCount()).isZero();
        unmanaged.get().close();
    }

    @Test
    void profileConfigDataOverridesBaseFile() {
        try (var context = application(Map.of()).run()) {
            assertThat(context.getBean(DeliveryProperties.class).parallelism()).isEqualTo(5);
        }
    }

    @Test
    void environmentOverridesProfileAndCommandLineOverridesEnvironment() {
        try (var context = application(Map.of("ACME_DELIVERY_PARALLELISM", "7")).run()) {
            assertThat(context.getBean(DeliveryProperties.class).parallelism()).isEqualTo(7);
        }
        try (var context = application(Map.of("ACME_DELIVERY_PARALLELISM", "7"))
                .run("--acme.delivery.parallelism=9")) {
            assertThat(context.getBean(DeliveryProperties.class).parallelism()).isEqualTo(9);
        }
    }

    private static SpringApplication application(Map<String, Object> environmentValues) {
        StandardEnvironment environment = new StandardEnvironment();
        // Remove process-backed sources so fixture binding does not depend on local settings.
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource("fixtureEnvironment", environmentValues));
        SpringApplication application = new SpringApplication(BootstrapConfiguration.class);
        application.setEnvironment(environment);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setRegisterShutdownHook(false);
        application.setLogStartupInfo(false);
        application.setDefaultProperties(Map.of("spring.config.location", "classpath:/fixture-config/",
                "spring.profiles.active", "staging", "spring.main.banner-mode", "off"));
        return application;
    }

    @Configuration(proxyBeanMethods = false)
    @Import(DeliveryAutoConfiguration.class)
    static class BootstrapConfiguration {
    }

    @Configuration(proxyBeanMethods = false)
    static class CustomClientConfiguration {
        @Bean
        DeliveryClient customClient() {
            return new DeliveryClient(new DeliveryProperties(4, Duration.ofSeconds(1)));
        }
    }

    @Configuration(proxyBeanMethods = true)
    static class FullConfiguration {
        @Bean
        DeliveryClient client() {
            return new DeliveryClient(new DeliveryProperties(4, Duration.ofSeconds(1)));
        }

        @Bean
        Dispatcher dispatcher() {
            return new Dispatcher(client());
        }
    }

    // Deliberate counterexample, retained to reproduce the identity/lifecycle defect.
    @Configuration(proxyBeanMethods = false)
    static class BrokenLiteConfiguration {
        @Bean
        DeliveryClient client() {
            return new DeliveryClient(new DeliveryProperties(4, Duration.ofSeconds(1)));
        }

        @Bean
        Dispatcher dispatcher() {
            return new Dispatcher(client());
        }
    }
}
