package example.harness;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Ticket {
    @Id
    private String id;
    @Column(nullable = false, length = 40)
    private String note;

    protected Ticket() {}

    public Ticket(String id, String note) {
        this.id = id;
        this.note = note;
    }

    public String getId() { return id; }
    public String getNote() { return note; }
}
