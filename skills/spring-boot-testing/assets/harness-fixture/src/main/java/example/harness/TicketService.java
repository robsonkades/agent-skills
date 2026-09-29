package example.harness;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TicketService {
    private final TicketRepository tickets;

    public TicketService(TicketRepository tickets) {
        this.tickets = tickets;
    }

    @Transactional
    public void create(String id, String note) {
        tickets.save(new Ticket(id, note));
    }

    @Transactional(readOnly = true)
    public String read(String id) {
        return tickets.findById(id)
                .orElseThrow(() -> new MissingTicket(id))
                .getNote();
    }

    public static class MissingTicket extends RuntimeException {
        public MissingTicket(String id) { super(id); }
    }
}
