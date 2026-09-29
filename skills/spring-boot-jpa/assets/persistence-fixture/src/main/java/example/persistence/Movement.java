package example.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

@Entity
public class Movement {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "inventory_sku", nullable = false, updatable = false)
    private Inventory inventory;

    @Column(nullable = false, updatable = false)
    private int quantity;

    protected Movement() {}

    Movement(Inventory inventory, int quantity) {
        if (inventory == null || quantity <= 0) {
            throw new IllegalArgumentException("Movement requires an owner and positive quantity");
        }
        this.inventory = inventory;
        this.quantity = quantity;
    }

    public Long getId() { return id; }
    public int getQuantity() { return quantity; }
}
