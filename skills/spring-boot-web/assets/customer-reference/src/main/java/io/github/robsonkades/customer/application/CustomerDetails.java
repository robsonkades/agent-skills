package io.github.robsonkades.customer.application;

import io.github.robsonkades.customer.domain.CustomerAddress;

import java.time.LocalDate;

public record CustomerDetails(
        String name,
        String email,
        String phone,
        String cpf,
        LocalDate birthDate,
        CustomerAddress address
) {}
