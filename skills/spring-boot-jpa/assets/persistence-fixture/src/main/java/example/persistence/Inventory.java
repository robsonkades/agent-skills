package example.persistence;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "inventory")
@EntityListeners(AuditingEntityListener.class)
public class Inventory {
    @Id
    @Column(name = "sku", nullable = false, length = 40, updatable = false)
    private String sku;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "description", nullable = false, length = 200)
    private String description;

    @Column(name = "available", nullable = false)
    private int available;

    @Column(name = "note", nullable = true, length = 500)
    private String note;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "inventory", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Movement> movements = new ArrayList<>();

    protected Inventory() {}

    public Inventory(String sku, String description, int available) {
        if (sku == null || sku.isBlank() || sku.length() > 40 || description == null
                || description.length() > 200 || available < 0) {
            throw new IllegalArgumentException("SKU, description and nonnegative stock are required");
        }
        this.sku = sku;
        this.description = description;
        this.available = available;
    }

    public void reserve(int quantity) {
        if (quantity <= 0 || quantity > available) {
            throw new IllegalArgumentException("Reservation must be positive and fit available stock");
        }
        available -= quantity;
        movements.add(new Movement(this, quantity));
    }

    public void changeNote(String note) {
        if (note != null && note.length() > 500) {
            throw new IllegalArgumentException("Note must fit 500 UTF-16 code units in this fixture");
        }
        this.note = note;
    }

    public String getSku() { return sku; }
    public Long getVersion() { return version; }
    public String getDescription() { return description; }
    public int getAvailable() { return available; }
    public String getNote() { return note; }
    public Instant getCreatedAt() { return createdAt; }
    public List<Movement> getMovements() { return List.copyOf(movements); }
}
