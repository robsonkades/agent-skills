package example.persistence;

public abstract sealed class InventoryException extends RuntimeException
        permits InventoryNotFoundException, InventoryVersionConflictException {
    private final String code;

    protected InventoryException(String code, String message) {
        super(message);
        this.code = code;
    }

    public final String code() { return code; }
}
