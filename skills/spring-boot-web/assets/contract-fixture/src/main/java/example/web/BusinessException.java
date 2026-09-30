package example.web;

/** Shared business failure contract. HTTP mapping belongs to the API advice. */
public abstract sealed class BusinessException extends RuntimeException
        permits ProductNotFoundException, DuplicateSkuException {
    private final String code;

    protected BusinessException(String code, String message) {
        super(message);
        this.code = code;
    }

    public final String code() {
        return code;
    }
}
