package example.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.OptimisticLockException;
import example.sqlserver.OutboxEvent;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.HashSet;
import org.hibernate.Hibernate;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.TestConstructor;
import org.springframework.test.util.ReflectionTestUtils;

@SpringBootTest(classes = FixtureApplication.class, properties = {
        "spring.main.web-application-type=none",
        "spring.datasource.url=jdbc:h2:mem:persistence-contract;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.open-in-view=false",
        "spring.jpa.properties.hibernate.jpa.compliance.proxy=false",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=example.persistence.PersistenceContractTest$SqlCapture"
})
@Import(PersistenceContractTest.FixedClockConfiguration.class)
@TestConstructor(autowireMode = TestConstructor.AutowireMode.ALL)
class PersistenceContractTest {
    private static final Instant FIXED_TIME = Instant.parse("2026-01-02T03:04:05Z");
    private final InventoryRepository inventory;
    private final InventoryService service;
    private final EntityManagerFactory entityManagers;

    PersistenceContractTest(InventoryRepository inventory, InventoryService service,
                            EntityManagerFactory entityManagers) {
        this.inventory = inventory;
        this.service = service;
        this.entityManagers = entityManagers;
    }

    @BeforeEach
    void seedCommittedState() {
        inventory.deleteAll();
        inventory.saveAndFlush(new Inventory("A", "Retain this description", 20));
    }

    @Test
    void managedUpdateCommitsAndPreservesFieldsNotInTheCommand() {
        service.reserve("A", 3);
        try (EntityManager observer = entityManagers.createEntityManager()) {
            Inventory result = observer.find(Inventory.class, "A");
            assertEquals(17, result.getAvailable());
            assertEquals("Retain this description", result.getDescription());
            assertEquals(1, result.getMovements().size());
            assertNotNull(result.getVersion());
        }
    }

    @Test
    void proxyRollsBackEvenAfterFlush() {
        assertThrows(IllegalStateException.class, () -> service.reserveThenFail("A", 3));
        try (EntityManager observer = entityManagers.createEntityManager()) {
            Inventory result = observer.find(Inventory.class, "A");
            assertEquals(20, result.getAvailable());
            assertTrue(result.getMovements().isEmpty());
        }
    }

    @Test
    void staleWriterConflictsInAnIndependentTransaction() {
        try (EntityManager first = entityManagers.createEntityManager();
             EntityManager second = entityManagers.createEntityManager()) {
            first.getTransaction().begin();
            second.getTransaction().begin();
            Inventory firstRead = first.find(Inventory.class, "A");
            Inventory secondRead = second.find(Inventory.class, "A");
            firstRead.reserve(3);
            secondRead.reserve(4);
            first.getTransaction().commit();
            try {
                assertThrows(OptimisticLockException.class, second::flush);
            } finally {
                if (second.getTransaction().isActive()) {
                    second.getTransaction().rollback();
                }
            }
        }
        try (EntityManager observer = entityManagers.createEntityManager()) {
            assertEquals(17, observer.find(Inventory.class, "A").getAvailable());
        }
    }

    @Test
    void collectionFetchPagePreservesEmptyRootsAndUsesDatabaseLimitOnHibernate74() {
        inventory.saveAndFlush(new Inventory("B", "No movements", 10));
        inventory.saveAndFlush(new Inventory("C", "Next page", 10));
        service.reserve("A", 1);
        service.reserve("A", 2);
        SqlCapture.clear();
        var first = inventory.findWithMovements(PageRequest.of(0, 2, Sort.by("sku")));
        var second = inventory.findWithMovements(PageRequest.of(1, 2, Sort.by("sku")));
        assertEquals(List.of("A", "B"), first.stream().map(Inventory::getSku).toList());
        assertEquals(List.of("C"), second.stream().map(Inventory::getSku).toList());
        assertEquals(3, first.getTotalElements());
        assertEquals(2, first.getContent().getFirst().getMovements().size());
        assertTrue(first.getContent().get(1).getMovements().isEmpty());
        assertTrue(SqlCapture.statements().stream()
                .map(String::toLowerCase)
                .anyMatch(sql -> sql.contains("join") && (sql.contains("fetch first")
                        || sql.contains("fetch next") || sql.contains("offset") || sql.contains("limit"))),
                "The fetch query must contain database limiting, not only limit in Java");
    }

    @Test
    void auditingUsesTheWiredClockAndSurvivesAnIndependentRead() {
        try (EntityManager observer = entityManagers.createEntityManager()) {
            assertEquals(FIXED_TIME, observer.find(Inventory.class, "A").getCreatedAt());
        }
    }

    @Test
    void optionalAttributePreservesNullAndPresentValuesWithAnExplicitLimit() {
        try (EntityManager writer = entityManagers.createEntityManager()) {
            writer.getTransaction().begin();
            Inventory item = writer.find(Inventory.class, "A");
            assertNull(item.getNote());
            item.changeNote("n".repeat(500));
            assertThrows(IllegalArgumentException.class, () -> item.changeNote("n".repeat(501)));
            writer.getTransaction().commit();
        }
        try (EntityManager observer = entityManagers.createEntityManager()) {
            assertEquals(500, observer.find(Inventory.class, "A").getNote().length());
            observer.getTransaction().begin();
            observer.find(Inventory.class, "A").changeNote(null);
            observer.getTransaction().commit();
            observer.clear();
            assertNull(observer.find(Inventory.class, "A").getNote());
        }
    }

    @Test
    void transientGeneratedIdEntitiesRemainDistinctAndReflexive() {
        Inventory owner = new Inventory("Transient", "Owner", 10);
        Movement first = new Movement(owner, 1);
        Movement second = new Movement(owner, 1);
        assertEquals(first, first);
        assertNotEquals(first, second);
        assertNotEquals(second, first);
        assertNotEquals(first, null);
        assertNotEquals(first, owner);
        assertEquals(2, new HashSet<>(List.of(first, second)).size());
        // Synthetic collision across entity types; no SQL Server connection is involved.
        OutboxEvent otherType = new OutboxEvent(0, "fixture");
        ReflectionTestUtils.setField(first, "id", 42L);
        ReflectionTestUtils.setField(otherType, "id", 42L);
        assertNotEquals(first, otherType);
        assertNotEquals(otherType, first);
    }

    @Test
    void generatedIdAssignmentPreservesHashMembershipAndDetachedEquality() {
        Movement beforePersist;
        HashSet<Movement> movements = new HashSet<>();
        int initialHash;
        try (EntityManager writer = entityManagers.createEntityManager()) {
            writer.getTransaction().begin();
            Inventory owner = writer.find(Inventory.class, "A");
            owner.reserve(1);
            beforePersist = owner.getMovements().getFirst();
            assertNull(beforePersist.getId());
            initialHash = beforePersist.hashCode();
            movements.add(beforePersist);
            writer.flush();
            assertNotNull(beforePersist.getId());
            assertEquals(initialHash, beforePersist.hashCode());
            assertTrue(movements.contains(beforePersist));
            writer.getTransaction().commit();
        }
        try (EntityManager reader = entityManagers.createEntityManager()) {
            Movement reloaded = reader.find(Movement.class, beforePersist.getId());
            assertEquals(beforePersist, reloaded);
            assertEquals(reloaded, beforePersist);
            assertEquals(initialHash, reloaded.hashCode());
            assertTrue(movements.contains(reloaded));
        }
    }

    @Test
    void proxyEqualityIsSymmetricWithoutInitializationWhenProxyComplianceIsDisabled() {
        service.reserve("A", 1);
        Movement detached;
        try (EntityManager reader = entityManagers.createEntityManager()) {
            detached = reader.find(Inventory.class, "A").getMovements().getFirst();
        }
        Movement proxy;
        try (EntityManager reader = entityManagers.createEntityManager()) {
            proxy = reader.getReference(Movement.class, detached.getId());
            assertFalse(Hibernate.isInitialized(proxy));
            assertEquals(detached.hashCode(), proxy.hashCode());
            assertEquals(detached, proxy);
            assertEquals(proxy, detached);
            assertFalse(Hibernate.isInitialized(proxy));
        }
        assertEquals(detached, proxy);
        assertEquals(proxy, detached);
        assertEquals(detached.hashCode(), proxy.hashCode());
        assertFalse(Hibernate.isInitialized(proxy));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {
        @Bean
        @Primary
        Clock testClock() {
            return Clock.fixed(FIXED_TIME, ZoneOffset.UTC);
        }
    }

    public static class SqlCapture implements StatementInspector {
        private static final List<String> SQL = new java.util.concurrent.CopyOnWriteArrayList<>();

        @Override
        public String inspect(String sql) {
            SQL.add(sql);
            return sql;
        }

        static void clear() { SQL.clear(); }
        static List<String> statements() { return List.copyOf(SQL); }
    }
}
