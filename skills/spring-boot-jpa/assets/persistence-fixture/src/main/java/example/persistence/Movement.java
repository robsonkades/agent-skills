package example.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.util.Objects;
import org.hibernate.proxy.HibernateProxy;

@Entity
@Table(name = "movement")
public class Movement {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "movement_seq")
    @SequenceGenerator(name = "movement_seq", sequenceName = "movement_seq", allocationSize = 10)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "inventory_sku", nullable = false, updatable = false)
    private Inventory inventory;

    @Column(name = "quantity", nullable = false, updatable = false)
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

    @Override
    public final boolean equals(Object other) {
        if (this == other) return true;
        if (other == null) return false;
        Class<?> thisClass = this instanceof HibernateProxy proxy
                ? proxy.getHibernateLazyInitializer().getPersistentClass() : getClass();
        Class<?> otherClass = other instanceof HibernateProxy proxy
                ? proxy.getHibernateLazyInitializer().getPersistentClass() : other.getClass();
        if (thisClass != otherClass) return false;
        Movement that = (Movement) other;
        return getId() != null && Objects.equals(this.getId(), that.getId());
    }

    @Override
    public final int hashCode() {
        return (this instanceof HibernateProxy proxy
                ? proxy.getHibernateLazyInitializer().getPersistentClass() : getClass()).hashCode();
    }
}
