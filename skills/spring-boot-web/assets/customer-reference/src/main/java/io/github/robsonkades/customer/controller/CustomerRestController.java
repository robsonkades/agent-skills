package io.github.robsonkades.customer.controller;

import io.github.robsonkades.customer.application.CustomerCriterion;
import io.github.robsonkades.customer.application.CustomerDetails;
import io.github.robsonkades.customer.application.CustomerSearch;
import io.github.robsonkades.customer.application.CustomerService;
import io.github.robsonkades.customer.controller.documentation.CustomerApi;
import io.github.robsonkades.customer.controller.dto.CustomerPageResponse;
import io.github.robsonkades.customer.controller.dto.CustomerRequest;
import io.github.robsonkades.customer.controller.dto.CustomerResponse;
import io.github.robsonkades.customer.controller.dto.CustomerSearchRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.WebAsyncTask;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;

@RestController
public class CustomerRestController implements CustomerApi {

    private final CustomerService customerService;

    public CustomerRestController(final CustomerService customerService) {
        this.customerService = customerService;
    }

    @Override
    public WebAsyncTask<ResponseEntity<CustomerResponse>> createCustomer(final CustomerRequest customerRequest) {
        var locationBuilder = ServletUriComponentsBuilder
                .fromCurrentRequestUri()
                .pathSegment("{customerId}");

        return async(() -> {
            var customer = customerService.create(details(customerRequest));
            var location = locationBuilder.buildAndExpand(customer.id()).toUri();
            return ResponseEntity.created(location).body(CustomerResponse.from(customer));
        });
    }

    @Override
    public WebAsyncTask<ResponseEntity<CustomerPageResponse>> listCustomers(final String name, final String email, final String phone, final String cpf, int page, int size) {
        return async(() -> ResponseEntity.ok(CustomerPageResponse.from(customerService.search(new CustomerSearch(simpleCriteria(name, email, phone, cpf), List.of(), page, size)))));
    }

    @Override
    public WebAsyncTask<ResponseEntity<CustomerPageResponse>> searchCustomers(final CustomerSearchRequest request) {
        return async(() -> ResponseEntity.ok(CustomerPageResponse.from(customerService.search(request.toQuery()))));
    }

    @Override
    public WebAsyncTask<ResponseEntity<CustomerResponse>> getCustomerById(final UUID customerId) {
        return async(() -> ResponseEntity.ok(CustomerResponse.from(customerService.getById(customerId))));
    }

    @Override
    public WebAsyncTask<ResponseEntity<CustomerResponse>> replaceCustomer(final UUID customerId, final CustomerRequest customerRequest) {
        return async(() -> ResponseEntity.ok(CustomerResponse.from(customerService.replace(customerId, details(customerRequest)))));
    }

    @Override
    public WebAsyncTask<ResponseEntity<CustomerResponse>> patchCustomer(final UUID customerId, final JsonNode patchDocument) {
        return async(() -> ResponseEntity.ok(CustomerResponse.from(customerService.patch(customerId, CustomerPatchMapper.toCommand(patchDocument)))));
    }

    private static CustomerDetails details(final CustomerRequest request) {
        return new CustomerDetails(
                request.name(),
                request.email(),
                request.phone(),
                request.cpf(),
                request.birthDate(),
                request.address().toDomain()
        );
    }

    private static List<CustomerCriterion> simpleCriteria(final String name, final String email, final String phone, final String cpf) {
        var criteria = new ArrayList<CustomerCriterion>();
        addContains(criteria, "name", name);
        addContains(criteria, "email", email);
        addContains(criteria, "phone", phone);
        addContains(criteria, "cpf", cpf);
        return List.copyOf(criteria);
    }

    private static void addContains(final List<CustomerCriterion> criteria, final String field, final String value) {
        if (value != null && !value.isBlank()) {
            criteria.add(new CustomerCriterion.Contains(field, value));
        }
    }

    private static <T> WebAsyncTask<T> async(final Callable<T> task) {
        return new WebAsyncTask<>(task);
    }

}
