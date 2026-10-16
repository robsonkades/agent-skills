package example.harness;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest
@Import(TicketService.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class TicketServiceCommitTest {
    @Autowired
    TicketService service;

    @Autowired
    TicketRepository tickets;

    private final String id = UUID.randomUUID().toString();

    @Test
    void createdTicketIsVisibleAfterTheServiceReturns() {
        assertThat(TestTransaction.isActive()).isFalse();
        service.create(id, "printer unavailable");

        assertThat(tickets.findById(id)).get()
                .extracting(Ticket::getNote).isEqualTo("printer unavailable");
    }

    @AfterEach
    void removeCommittedTestData() {
        tickets.deleteById(id);
        assertThat(tickets.existsById(id)).isFalse();
    }
}
