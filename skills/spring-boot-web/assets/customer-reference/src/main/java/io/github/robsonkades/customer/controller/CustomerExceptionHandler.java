package io.github.robsonkades.customer.controller;

import io.github.robsonkades.customer.application.CustomerNotFoundException;
import io.github.robsonkades.customer.domain.InvalidCustomerException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;

@RestControllerAdvice(assignableTypes = CustomerRestController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CustomerExceptionHandler {

    @ExceptionHandler(CustomerNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleCustomerNotFound(final CustomerNotFoundException exception, final HttpServletRequest request) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());
        problem.setType(URI.create("urn:problem:customer-not-found"));
        problem.setTitle("Cliente não encontrado");
        problem.setInstance(URI.create(request.getRequestURI()));
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problem);
    }

    @ExceptionHandler(InvalidCustomerException.class)
    public ResponseEntity<ProblemDetail> handleInvalidCustomer(final InvalidCustomerException exception, final HttpServletRequest request) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setType(URI.create("urn:problem:invalid-customer"));
        problem.setTitle("Dados de cliente inválidos");
        problem.setInstance(URI.create(request.getRequestURI()));
        return ResponseEntity.badRequest().body(problem);
    }
}
