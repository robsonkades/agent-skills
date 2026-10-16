package example.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import org.springframework.stereotype.Service;
import static example.web.Models.*;

/** Process-local storage for a disposable HTTP fixture, not a persistence recommendation. */
@Service
public final class ProductStore {
    private final Map<UUID, Product> products = new LinkedHashMap<>();
    private final ReadWriteLock productsLock = new ReentrantReadWriteLock();

    public Product create(ProductCreate input) {
        productsLock.writeLock().lock();
        try {
            if (products.values().stream().anyMatch(product -> product.sku().equals(input.sku()))) {
                throw new DuplicateSkuException(input.sku());
            }
            Product product = new Product(UUID.randomUUID(), input.sku(), input.title(), input.description(), input.dimensions());
            products.put(product.id(), product);
            return product;
        } finally {
            productsLock.writeLock().unlock();
        }
    }

    public Product get(UUID id) {
        productsLock.readLock().lock();
        try {
            return requireProduct(id);
        } finally {
            productsLock.readLock().unlock();
        }
    }

    public List<Product> list(int limit) {
        productsLock.readLock().lock();
        try {
            return products.values().stream().limit(limit).toList();
        } finally {
            productsLock.readLock().unlock();
        }
    }

    public Product patch(UUID id, boolean present, String description) {
        productsLock.writeLock().lock();
        try {
            Product before = requireProduct(id);
            Product after = new Product(id, before.sku(), before.title(), present ? description : before.description(), before.dimensions());
            products.put(id, after);
            return after;
        } finally {
            productsLock.writeLock().unlock();
        }
    }

    public void delete(UUID id) {
        productsLock.writeLock().lock();
        try {
            requireProduct(id);
            products.remove(id);
        } finally {
            productsLock.writeLock().unlock();
        }
    }

    /** Caller holds the read or write lock; mutable map state never escapes that boundary. */
    private Product requireProduct(UUID id) {
        Product product = products.get(id);
        if (product == null) {
            throw new ProductNotFoundException(id);
        }
        return product;
    }
}
