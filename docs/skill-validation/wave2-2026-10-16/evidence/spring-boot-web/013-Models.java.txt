package example.web;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.UUID;

public final class Models {
    private Models() {}

    @Schema(name = "Dimensions", description = "Physical dimensions in whole millimetres; neither dimension may be omitted.")
    public record Dimensions(
            @NotNull @Min(1)
            @Schema(description = "Width in millimetres.", example = "120", minimum = "1", requiredMode = Schema.RequiredMode.REQUIRED)
            Integer width,
            @NotNull @Min(1)
            @Schema(description = "Height in millimetres.", example = "80", minimum = "1", requiredMode = Schema.RequiredMode.REQUIRED)
            Integer height) {}

    @Schema(name = "ProductCreate", description = "New catalog entry. Optional description and dimensions may be omitted or null; both mean no value on creation. Unknown properties are ignored; only declared input fields are stored.")
    public record ProductCreate(
            @NotNull @Pattern(regexp = "^[A-Z0-9-]{3,20}$")
            @Schema(description = "Case-sensitive unique catalog code; uppercase ASCII, digits and hyphens only.", example = "BOX-01", pattern = "^[A-Z0-9-]{3,20}$", minLength = 3, maxLength = 20, requiredMode = Schema.RequiredMode.REQUIRED)
            String sku,
            @NotBlank @CodePointLength(min = 3, max = 80)
            @Schema(description = "Display title, 3 to 80 Unicode code points and not blank.", example = "Storage box", minLength = 3, maxLength = 80, requiredMode = Schema.RequiredMode.REQUIRED)
            String title,
            @CodePointLength(max = 200)
            @Schema(description = "Optional public description, at most 200 Unicode code points; null or omission means no description.", example = "Recycled cardboard", types = {"string", "null"}, maxLength = 200, requiredMode = Schema.RequiredMode.NOT_REQUIRED)
            String description,
            @Valid
            @Schema(description = "Optional physical measurements; null or omission means unknown.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
            Dimensions dimensions) {}

    @Schema(name = "Product", description = "Public catalog representation, including optional values as JSON null when absent.")
    public record Product(
            @Schema(description = "Server-generated UUID; never supplied when creating or patching.", format = "uuid", accessMode = Schema.AccessMode.READ_ONLY, requiredMode = Schema.RequiredMode.REQUIRED, example = "9d650c1e-0731-4dbf-8529-0fb50d7746ec")
            UUID id,
            @Schema(description = "Unique catalog code.", example = "BOX-01", requiredMode = Schema.RequiredMode.REQUIRED)
            String sku,
            @Schema(description = "Public display title.", example = "Storage box", requiredMode = Schema.RequiredMode.REQUIRED)
            String title,
            @Schema(description = "Public description, or null if unset.", types = {"string", "null"}, example = "Recycled cardboard", requiredMode = Schema.RequiredMode.REQUIRED)
            String description,
            @Schema(description = "Physical measurements, or null if unknown.", requiredMode = Schema.RequiredMode.REQUIRED)
            Dimensions dimensions) {}

    @Schema(name = "ProductPatch", description = "Only description is patchable: omission preserves, null clears, a string replaces. Unknown properties are rejected.", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    public record ProductPatch(
            @Schema(description = "Omit to preserve; null clears; string replaces, at most 200 Unicode code points.", types = {"string", "null"}, maxLength = 200, requiredMode = Schema.RequiredMode.NOT_REQUIRED, example = "Updated description")
            String description) {}

    @Schema(name = "Violation", description = "One invalid input condition; the same field may have multiple entries.")
    public record Violation(
            @Schema(description = "Canonical public input path, with numeric collection indices where known; request for global or unmapped errors.", example = "title", requiredMode = Schema.RequiredMode.REQUIRED)
            String field,
            @Schema(description = "Constraint message without the rejected value.", example = "must not be blank", requiredMode = Schema.RequiredMode.REQUIRED)
            String message) {}

    @Schema(name = "ApiProblem", description = "Problem Details response. violations appears only when input validation produced conditions to report; it is omitted for other failures.")
    public record ApiProblem(
            @Schema(description = "Problem type URI when supplied; omission means about:blank and the HTTP status meaning.", format = "uri", example = "about:blank", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
            String type,
            @Schema(description = "Short HTTP problem title.", example = "Bad Request", requiredMode = Schema.RequiredMode.REQUIRED)
            String title,
            @Schema(description = "HTTP status code.", example = "400", minimum = "100", maximum = "599", requiredMode = Schema.RequiredMode.REQUIRED)
            int status,
            @Schema(description = "Safe explanation of this failure.", example = "Input validation failed", requiredMode = Schema.RequiredMode.REQUIRED)
            String detail,
            @Schema(description = "Path identifying the failing request.", format = "uri-reference", example = "/api/products", requiredMode = Schema.RequiredMode.REQUIRED)
            String instance,
            @Schema(description = "Stable business error code for a missing product or duplicate catalog code; omitted for other errors.", allowableValues = {"PRODUCT_NOT_FOUND", "DUPLICATE_SKU"}, example = "PRODUCT_NOT_FOUND", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
            String code,
            @ArraySchema(arraySchema = @Schema(description = "Nonempty validation conditions when present, never null. Order is unspecified; multiple conditions for the same field are retained. Omitted for non-validation failures. No fixed maximum is imposed.", requiredMode = Schema.RequiredMode.NOT_REQUIRED, example = "[{\"field\":\"title\",\"message\":\"must not be blank\"},{\"field\":\"title\",\"message\":\"length must be between 3 and 80 Unicode code points\"}]"), schema = @Schema(implementation = Violation.class), minItems = 1, uniqueItems = false)
            List<Violation> violations) {}
}
