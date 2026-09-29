package example.harness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.PersistenceException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.test.context.transaction.AfterTransaction;

@DataJpaTest
class TicketRepositoryTest {
    @Autowired
    TicketRepository tickets;

    @Autowired
    TestEntityManager entities;

    private final String id = UUID.randomUUID().toString();

    @Test
    void noteRoundTripsThroughTheDatabase() {
        tickets.save(new Ticket(id, "printer unavailable"));
        entities.flush();
        entities.clear();

        assertThat(tickets.findById(id)).get()
                .extracting(Ticket::getNote).isEqualTo("printer unavailable");
    }

    @Test
    void flushExposesTheDatabaseLengthConstraint() {
        entities.persist(new Ticket(id, "x".repeat(41)));

        assertThatThrownBy(entities::flush).isInstanceOf(PersistenceException.class);
    }

    @AfterTransaction
    void testWritesWereRolledBack() {
        assertThat(tickets.existsById(id)).isFalse();
    }
}
