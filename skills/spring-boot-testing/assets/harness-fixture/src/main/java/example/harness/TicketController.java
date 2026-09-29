package example.harness;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TicketController {
    private final TicketService tickets;

    public TicketController(TicketService tickets) { this.tickets = tickets; }

    @PostMapping("/tickets")
    @ResponseStatus(HttpStatus.CREATED)
    public void create(@Valid @RequestBody NewTicket ticket) {
        tickets.create(ticket.id(), ticket.note());
    }

    @GetMapping("/tickets/{id}")
    public String read(@PathVariable String id) { return tickets.read(id); }

    public record NewTicket(@NotBlank String id, @NotBlank @Size(max = 40) String note) {}
}
