package example.web;

/** Synthetic whole-body examples; JSON fragments are compile-time annotation constants. */
public final class ApiExamples {
    private ApiExamples() {}

    public static final String PRODUCT = """
            {"id":"9d650c1e-0731-4dbf-8529-0fb50d7746ec","sku":"BOX-02","title":"Storage box", "description":"Recycled cardboard","dimensions":{"width":120,"height":80}}
            """;
    public static final String VALIDATION = """
            {"title":"Bad Request","status":400,"detail":"Input validation failed","instance":"/api/products","violations":[{"field":"title","message":"must not be blank"},{"field":"title","message":"length must be between 3 and 80 Unicode code points"}]}
            """;
    public static final String MISSING = """
            {"title":"Not Found","status":404,"detail":"Product not found","instance":"/api/products/9d650c1e-0731-4dbf-8529-0fb50d7746ec"}
            """;
    public static final String DUPLICATE = """
            {"title":"Conflict","status":409,"detail":"Catalog code already exists","instance":"/api/products"}
            """;
    public static final String INVALID_LIMIT = """
            {"title":"Bad Request","status":400,"detail":"Input validation failed","instance":"/api/products","violations":[{"field":"limit","message":"must be greater than or equal to 1"}]}
            """;
    public static final String INVALID_PATCH = """
            {"title":"Bad Request","status":400,"detail":"Only the description property is accepted","instance":"/api/products/9d650c1e-0731-4dbf-8529-0fb50d7746ec"}
            """;
    public static final String NOT_ACCEPTABLE = """
            {"title":"Not Acceptable","status":406,"detail":"Acceptable representations: [application/json].","instance":"/api/products"}
            """;
    public static final String UNSUPPORTED_MEDIA = """
            {"title":"Unsupported Media Type","status":415,"detail":"Content-Type 'text/plain' is not supported.","instance":"/api/products"}
            """;
}
