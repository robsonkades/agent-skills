package example.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.Hibernate;
import org.hibernate.LazyInitializationException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestConstructor;

@SpringBootTest(classes = FixtureApplication.class, properties = {
        "spring.main.web-application-type=none",
        "spring.datasource.url=jdbc:h2:mem:proxy-compliance-contract;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.open-in-view=false",
        "spring.jpa.properties.hibernate.jpa.compliance.proxy=true"
})
@TestConstructor(autowireMode = TestConstructor.AutowireMode.ALL)
class ProxyComplianceContractTest {
    private final InventoryRepository inventory;
    private final InventoryService service;
    private final EntityManagerFactory entityManagers;

    ProxyComplianceContractTest(InventoryRepository inventory, InventoryService service,
                                EntityManagerFactory entityManagers) {
        this.inventory = inventory;
        this.service = service;
        this.entityManagers = entityManagers;
    }

    @Test
    void identifierAccessDependsOnComplianceAndWhetherTheProxyRetainsItsSession() {
        inventory.saveAndFlush(new Inventory("Compliance", "Owner", 10));
        service.reserve("Compliance", 1);
        Movement detached;
        try (EntityManager reader = entityManagers.createEntityManager()) {
            detached = reader.find(Inventory.class, "Compliance").getMovements().getFirst();
        }
        try (EntityManager reader = entityManagers.createEntityManager()) {
            Movement proxy = reader.getReference(Movement.class, detached.getId());
            assertFalse(Hibernate.isInitialized(proxy));
            assertEquals(detached.hashCode(), proxy.hashCode());
            assertFalse(Hibernate.isInitialized(proxy));
            assertEquals(detached, proxy);
            assertEquals(proxy, detached);
            assertTrue(Hibernate.isInitialized(proxy));
        }
        Movement closedProxy;
        try (EntityManager reader = entityManagers.createEntityManager()) {
            closedProxy = reader.getReference(Movement.class, detached.getId());
            assertFalse(Hibernate.isInitialized(closedProxy));
        }
        assertEquals(detached.hashCode(), closedProxy.hashCode());
        assertEquals(detached, closedProxy);
        assertEquals(closedProxy, detached);
        assertFalse(Hibernate.isInitialized(closedProxy));
        assertThrows(LazyInitializationException.class, closedProxy::getQuantity);
    }
}
