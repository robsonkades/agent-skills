package io.github.robsonkades.customer.domain;

import java.util.Objects;
import java.time.LocalDate;
import java.util.UUID;
import java.util.regex.Pattern;

public record Customer(UUID id, String name, String email, String phone, String cpf,
                       LocalDate birthDate, CustomerAddress address) {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    public Customer {
        Objects.requireNonNull(id, "id must not be null");
        name = required(name, "nome");
        email = required(email, "e-mail");
        phone = required(phone, "telefone");
        cpf = normalizeCpf(cpf);
        birthDate = Objects.requireNonNull(birthDate, "birthDate must not be null");
        address = Objects.requireNonNull(address, "address must not be null");
        if (birthDate.isAfter(LocalDate.now())) {
            throw new InvalidCustomerException("A data de nascimento não pode estar no futuro.");
        }
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new InvalidCustomerException("Informe um endereço de e-mail válido.");
        }
    }

    public Customer withDetails(String name, String email, String phone, String cpf,
                                LocalDate birthDate, CustomerAddress address) {
        return new Customer(id, name, email, phone, cpf, birthDate, address);
    }

    private static String normalizeCpf(String value) {
        String cpf = required(value, "CPF").replaceAll("\\D", "");
        if (cpf.length() != 11 || cpf.chars().distinct().count() == 1
                || !validCpfDigit(cpf, 9) || !validCpfDigit(cpf, 10)) {
            throw new InvalidCustomerException("Informe um CPF válido.");
        }
        return cpf;
    }

    private static boolean validCpfDigit(String cpf, int digitIndex) {
        int sum = 0;
        for (int i = 0; i < digitIndex; i++) {
            sum += (cpf.charAt(i) - '0') * (digitIndex + 1 - i);
        }
        int remainder = (sum * 10) % 11;
        int expected = remainder == 10 ? 0 : remainder;
        return expected == cpf.charAt(digitIndex) - '0';
    }

    private static String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new InvalidCustomerException("O campo '" + field + "' é obrigatório.");
        }
        return value.strip();
    }
}
