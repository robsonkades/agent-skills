package example.hexagonal.adapter;

import example.hexagonal.application.OrderStore.DuplicateOrder;
import example.hexagonal.application.OrderStore.StorageFailure;
import example.hexagonal.application.Orders;
import example.hexagonal.domain.Order;
import java.security.Principal;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public final class HttpOrders {
    private final Orders orders;

    public HttpOrders(Orders orders) {
        this.orders = orders;
    }

    @PostMapping("/orders")
    public ResponseEntity<Created> create(Principal principal, @RequestBody Request request) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        Order order = orders.create(new Orders.Actor(principal.getName()),
                new Orders.Create(request.id(), request.customerId(), request.quantity()));
        return ResponseEntity.status(HttpStatus.CREATED).body(new Created(order.id(), order.quantity()));
    }

    @ExceptionHandler(Orders.Forbidden.class)
    public ProblemDetail forbidden() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Customer access denied");
    }

    @ExceptionHandler(Order.InvalidOrder.class)
    public ProblemDetail invalid() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid order");
    }

    @ExceptionHandler(DuplicateOrder.class)
    public ProblemDetail duplicate() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Order ID already exists");
    }

    @ExceptionHandler(StorageFailure.class)
    public ProblemDetail storageFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Order storage failed");
    }

    public record Request(UUID id, String customerId, int quantity) {}

    public record Created(UUID id, int quantity) {}
}
