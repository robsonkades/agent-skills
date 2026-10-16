package example.web;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import static example.web.Models.*;
import static org.junit.jupiter.api.Assertions.*;

class ProductStoreTest {
    @Test
    void concurrentCreationsWithTheSameSkuHaveExactlyOneWinner() throws Exception {
        ProductStore store = new ProductStore();
        ProductCreate input = input("BOX-01", "Original description");
        Callable<Boolean> create = () -> {
            try {
                store.create(input);
                return true;
            } catch (DuplicateSkuException failure) {
                assertEquals(input.sku(), failure.sku());
                return false;
            }
        };

        List<Boolean> outcomes = race(Collections.nCopies(8, create));

        assertEquals(1L, outcomes.stream().filter(Boolean::booleanValue).count());
        race(List.of(() -> {
            List<Product> products = store.list(10);
            assertEquals(1, products.size());
            Product winner = products.getFirst();
            assertEquals(input.sku(), winner.sku());
            assertEquals(input.description(), winner.description());
            assertEquals(winner, store.get(winner.id()));
            Product next = store.create(input("BOX-02", "Next product"));
            assertEquals(List.of(winner, next), store.list(10));
            return true;
        }));
    }

    @Test
    void concurrentPatchCannotResurrectADeletedProduct() throws Exception {
        // Exercise competing starts; either operation may acquire the write lock first.
        for (int attempt = 0; attempt < 32; attempt++) {
            ProductStore store = new ProductStore();
            Product product = store.create(input("BOX-01", "Original description"));

            race(List.of(
                    () -> {
                        try {
                            Product patched = store.patch(product.id(), true, "Updated description");
                            assertEquals(product.id(), patched.id());
                            assertEquals("Updated description", patched.description());
                            return true;
                        } catch (ProductNotFoundException failure) {
                            assertEquals(product.id(), failure.productId());
                            return false;
                        }
                    },
                    () -> {
                        store.delete(product.id());
                        return true;
                    }));

            race(List.of(() -> {
                assertTrue(store.list(10).isEmpty());
                ProductNotFoundException missing = assertThrows(ProductNotFoundException.class,
                        () -> store.get(product.id()));
                assertEquals(product.id(), missing.productId());
                assertThrows(ProductNotFoundException.class, () -> store.delete(product.id()));
                assertThrows(ProductNotFoundException.class,
                        () -> store.patch(product.id(), true, "Cannot restore"));
                return true;
            }));
            // A different worker must still make progress after the failing operations.
            race(List.of(() -> {
                Product replacement = store.create(input("BOX-02", "Replacement"));
                assertEquals(List.of(replacement), store.list(10));
                return true;
            }));
        }
    }

    @Test
    void listIsADetachedSnapshotInInsertionOrderAcrossUpdatesAndDeletes() {
        ProductStore store = new ProductStore();
        Product first = store.create(input("BOX-01", "First"));
        Product second = store.create(input("BOX-02", "Second"));
        Product third = store.create(input("BOX-03", "Third"));
        List<Product> snapshot = store.list(10);
        List<Product> limitedSnapshot = store.list(2);

        Product updatedSecond = store.patch(second.id(), true, "Updated second");
        store.delete(first.id());
        Product fourth = store.create(input("BOX-04", "Fourth"));

        assertEquals(List.of(first, second, third), snapshot);
        assertEquals(List.of(first, second), limitedSnapshot);
        assertEquals("Second", second.description());
        assertEquals(List.of(updatedSecond, third, fourth), store.list(10));
        assertEquals(List.of(updatedSecond, third), store.list(2));
        assertTrue(store.list(0).isEmpty());
    }

    private static ProductCreate input(String sku, String description) {
        return new ProductCreate(sku, "Storage box", description, null);
    }

    private static <T> List<T> race(List<Callable<T>> actions) throws Exception {
        var executor = Executors.newFixedThreadPool(actions.size(), Thread.ofPlatform().daemon(true).factory());
        CountDownLatch ready = new CountDownLatch(actions.size());
        CountDownLatch start = new CountDownLatch(1);
        List<Future<T>> futures = new ArrayList<>();
        try {
            for (Callable<T> action : actions) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    assertTrue(start.await(5, TimeUnit.SECONDS), "Start signal timed out");
                    return action.call();
                }));
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS), "Workers did not become ready");
            start.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) {
                results.add(future.get(5, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            start.countDown();
            futures.forEach(future -> future.cancel(true));
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS), "Workers did not stop");
        }
    }
}
