package example.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import static example.web.Models.*;

/** Process-local storage for a disposable HTTP fixture, not a persistence recommendation. */
@Service
public final class ProductStore {
    private final Map<UUID, Product> products = new LinkedHashMap<>();

    public synchronized Product create(ProductCreate input) {
        if (products.values().stream().anyMatch(product -> product.sku().equals(input.sku()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Catalog code already exists");
        }
        Product product = new Product(UUID.randomUUID(), input.sku(), input.title(), input.description(), input.dimensions());
        products.put(product.id(), product);
        return product;
    }

    public synchronized Product get(UUID id) {
        Product product = products.get(id);
        if (product == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found");
        }
        return product;
    }

    public synchronized List<Product> list(int limit) {
        return products.values().stream().limit(limit).toList();
    }

    public synchronized Product patch(UUID id, boolean present, String description) {
        Product before = get(id);
        Product after = new Product(id, before.sku(), before.title(), present ? description : before.description(), before.dimensions());
        products.put(id, after);
        return after;
    }

    public synchronized void delete(UUID id) {
        get(id);
        products.remove(id);
    }
}
