package example.sqlserver;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.Nationalized;
import org.hibernate.type.SqlTypes;

/** SQL Server-only mapping probe; deliberately outside the H2 application's scan. */
@Entity
@Table(name = "outbox_event")
public class OutboxEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "outbox_event_seq")
    @SequenceGenerator(name = "outbox_event_seq", sequenceName = "outbox_event_seq", allocationSize = 50)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @JdbcTypeCode(SqlTypes.TINYINT)
    @Column(name = "status", nullable = false)
    private Short status;

    @JdbcTypeCode(SqlTypes.INTEGER)
    @Column(name = "attempts", nullable = false)
    private Integer attempts;

    @Nationalized
    @Column(name = "payload", nullable = false, length = 1000, updatable = false)
    private String payload;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    protected OutboxEvent() {}

    public OutboxEvent(int status, String payload) {
        if (status < 0 || status > 255 || payload == null || payload.length() > 1000) {
            throw new IllegalArgumentException("Status must fit SQL Server TINYINT; payload is required");
        }
        this.status = (short) status;
        this.attempts = 0;
        this.payload = payload;
    }

    public Long getId() { return id; }
    public Short getStatus() { return status; }
    public String getPayload() { return payload; }
}
