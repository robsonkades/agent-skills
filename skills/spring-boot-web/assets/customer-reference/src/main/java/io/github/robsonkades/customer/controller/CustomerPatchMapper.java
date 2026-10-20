package io.github.robsonkades.customer.controller;

import io.github.robsonkades.customer.application.CustomerPatch;
import io.github.robsonkades.customer.application.FieldPatch;
import io.github.robsonkades.customer.domain.CustomerAddress;
import io.github.robsonkades.customer.domain.InvalidCustomerException;
import tools.jackson.databind.JsonNode;

import java.util.Set;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;

final class CustomerPatchMapper {

    private static final Set<String> SUPPORTED_FIELDS = Set.of("name", "email", "phone", "cpf", "birthDate", "address");

    private CustomerPatchMapper() {}

    static CustomerPatch toCommand(JsonNode document) {
        if (document == null || !document.isObject()) {
            throw new InvalidCustomerException("O documento JSON Merge Patch deve ser um objeto JSON.");
        }

        for (String field : document.propertyNames()) {
            if (!SUPPORTED_FIELDS.contains(field)) {
                throw new InvalidCustomerException("Campo de cliente não permitido: " + field + ".");
            }
        }

        return new CustomerPatch(
                field(document, "name"),
                field(document, "email"),
                field(document, "phone"),
                field(document, "cpf"),
                dateField(document, "birthDate"),
                addressField(document));
    }

    private static FieldPatch<LocalDate> dateField(JsonNode document, String name) {
        if (!document.has(name)) return FieldPatch.absent();
        JsonNode value = document.get(name);
        if (value == null || value.isNull()) return FieldPatch.of(null);
        if (!value.isString()) throw new InvalidCustomerException("O campo '" + name + "' deve ser uma data ISO (AAAA-MM-DD) ou null.");
        try {
            return FieldPatch.of(LocalDate.parse(value.stringValue()));
        } catch (DateTimeParseException exception) {
            throw new InvalidCustomerException("O campo '" + name + "' deve usar o formato AAAA-MM-DD.");
        }
    }

    private static FieldPatch<CustomerAddress> addressField(JsonNode document) {
        if (!document.has("address")) return FieldPatch.absent();
        JsonNode address = document.get("address");
        if (address == null || address.isNull()) return FieldPatch.of(null);
        if (!address.isObject()) throw new InvalidCustomerException("O campo 'address' deve ser um objeto JSON completo.");
        Set<String> supported = Set.of("street", "number", "complement", "neighborhood", "city", "state", "postalCode");
        for (String field : address.propertyNames()) {
            if (!supported.contains(field))
                throw new InvalidCustomerException("Campo de endereço não permitido: " + field + ".");
        }
        return FieldPatch.of(new CustomerAddress(requiredText(address, "street"), requiredText(address, "number"),
                optionalText(address, "complement"), requiredText(address, "neighborhood"),
                requiredText(address, "city"), requiredText(address, "state"), requiredText(address, "postalCode")));
    }

    private static String requiredText(JsonNode object, String name) {
        String value = optionalText(object, name);
        if (value == null || value.isBlank()) throw new InvalidCustomerException("O campo 'address." + name + "' é obrigatório.");
        return value;
    }

    private static String optionalText(JsonNode object, String name) {
        JsonNode value = object.get(name);
        if (value == null || value.isNull()) return null;
        if (!value.isString()) throw new InvalidCustomerException("O campo 'address." + name + "' deve ser texto ou null.");
        return value.stringValue();
    }

    private static FieldPatch<String> field(JsonNode document, String name) {
        if (!document.has(name)) {
            return FieldPatch.absent();
        }

        JsonNode value = document.get(name);
        if (value == null || value.isNull()) {
            return FieldPatch.of(null);
        }
        if (!value.isString()) {
            throw new InvalidCustomerException("O campo '" + name + "' deve ser texto ou null.");
        }
        return FieldPatch.of(value.stringValue());
    }
}
