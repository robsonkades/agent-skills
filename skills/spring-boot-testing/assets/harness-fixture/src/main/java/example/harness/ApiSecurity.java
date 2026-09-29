package example.harness;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
public class ApiSecurity {
    @Bean
    SecurityFilterChain apiChain(HttpSecurity http) throws Exception {
        return http.authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/tickets").hasRole("WRITER")
                        .anyRequest().authenticated())
                .httpBasic(Customizer.withDefaults())
                .build(); // CSRF remains enabled; test clients must supply a real or test token.
    }
}
