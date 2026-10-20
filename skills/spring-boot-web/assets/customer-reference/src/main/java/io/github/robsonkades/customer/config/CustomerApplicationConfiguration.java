package io.github.robsonkades.customer.config;

import io.github.robsonkades.customer.application.CustomerRepository;
import io.github.robsonkades.customer.application.CustomerService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class CustomerApplicationConfiguration {

    @Bean
    CustomerService customerService(CustomerRepository repository) {
        return new CustomerService(repository);
    }
}
