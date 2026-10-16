package example.harness;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
public class TicketController {
    private final TicketService tickets;

    public TicketController(TicketService tickets) { this.tickets = tickets; }

    @PostMapping("/tickets")
    public ResponseEntity<Void> create(@Valid @RequestBody NewTicket ticket) {
        tickets.create(ticket.id(), ticket.note());
        var location = UriComponentsBuilder.fromPath("/tickets/{id}")
                .encode().buildAndExpand(ticket.id()).toUri();
        return ResponseEntity.created(location).build();
    }

    @GetMapping("/tickets/{id}")
    public ResponseEntity<String> read(@PathVariable String id) {
        return ResponseEntity.ok(tickets.read(id));
    }

    public record NewTicket(@NotBlank String id, @NotBlank @Size(max = 40) String note) {}
}
