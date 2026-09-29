package example.persistence;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Version;
import java.util.ArrayList;
import java.util.List;

@Entity
public class Inventory {
    @Id
    @Column(length = 40, updatable = false)
    private String sku;

    @Version
    @Column(nullable = false)
    private Long version;

    @Column(nullable = false, length = 200)
    private String description;

    @Column(nullable = false)
    private int available;

    @Column(length = 500)
    private String note;

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
    public List<Movement> getMovements() { return List.copyOf(movements); }
}
