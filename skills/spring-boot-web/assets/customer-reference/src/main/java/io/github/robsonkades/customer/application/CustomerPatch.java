package io.github.robsonkades.customer.application;

import io.github.robsonkades.customer.domain.CustomerAddress;

import java.time.LocalDate;

public record CustomerPatch(
        FieldPatch<String> name,
        FieldPatch<String> email,
        FieldPatch<String> phone,
        FieldPatch<String> cpf,
        FieldPatch<LocalDate> birthDate,
        FieldPatch<CustomerAddress> address) {

    public boolean isEmpty() {
        return !name.present() && !email.present() && !phone.present() && !cpf.present() && !birthDate.present() && !address.present();
    }
}
