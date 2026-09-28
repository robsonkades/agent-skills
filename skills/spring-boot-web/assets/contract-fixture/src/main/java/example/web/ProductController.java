package example.web;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import static example.web.Models.*;

@RestController
@RequestMapping(value = "/products", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Catalog", description = "Disposable public catalog: process-local records disappear on restart.")
@ApiResponses({
        @ApiResponse(responseCode = "406", description = "Requested response media type is unavailable", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "notAcceptable", summary = "Request asks for text/plain", value = ApiExamples.NOT_ACCEPTABLE)))
})
public final class ProductController {
    private final ProductStore store;

    public ProductController(ProductStore store) {
        this.store = store;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "createProduct", summary = "Create a catalog product", description = "Creates one process-local product. Catalog codes are unique within this running fixture. Optional values may be omitted or null; follow Location to read the result.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Product created", headers = @Header(name = "Location", description = "Absolute URL of the created product", schema = @Schema(type = "string", format = "uri")), content = @Content(schema = @Schema(implementation = Product.class), examples = @ExampleObject(name = "created", summary = "Created from the complete request example", value = ApiExamples.PRODUCT))),
            @ApiResponse(responseCode = "400", description = "Malformed input or violated creation constraint", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "invalidTitle", summary = "Empty title violates two constraints", value = ApiExamples.VALIDATION))),
            @ApiResponse(responseCode = "409", description = "Catalog code already exists", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "duplicate", value = ApiExamples.DUPLICATE))),
            @ApiResponse(responseCode = "415", description = "Request Content-Type is not application/json", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "unsupportedMedia", summary = "Body sent as text/plain", value = ApiExamples.UNSUPPORTED_MEDIA)))
    })
    public ResponseEntity<Product> create(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true, description = "Catalog data; sku and title are mandatory, description and dimensions are optional.", content = @Content(examples = {
                    @ExampleObject(name = "minimum", summary = "Only mandatory values", value = "{\"sku\":\"BOX-01\",\"title\":\"Storage box\"}"),
                    @ExampleObject(name = "complete", summary = "Includes optional description and nested measurements", value = "{\"sku\":\"BOX-02\",\"title\":\"Storage box\",\"description\":\"Recycled cardboard\",\"dimensions\":{\"width\":120,\"height\":80}}")
            }))
            @Valid @RequestBody ProductCreate input) {
        Product product = store.create(input);
        return ResponseEntity.created(ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(product.id()).toUri()).body(product);
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getProduct", summary = "Read one product", description = "Reads an existing process-local record by its server-assigned UUID.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Current public representation", content = @Content(schema = @Schema(implementation = Product.class), examples = @ExampleObject(name = "complete", value = ApiExamples.PRODUCT))),
            @ApiResponse(responseCode = "404", description = "Product does not exist", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "missing", value = ApiExamples.MISSING)))
    })
    public Product get(@Parameter(description = "Server-assigned product UUID", required = true, example = "9d650c1e-0731-4dbf-8529-0fb50d7746ec") @PathVariable UUID id) {
        return store.get(id);
    }

    @GetMapping
    @Operation(operationId = "listProducts", summary = "List recent catalog contents", description = "Returns at most limit products in insertion order. This fixture has no page cursor or durable ordering across restarts.")
    @ApiResponse(responseCode = "200", description = "Array in insertion order, from zero up to limit records; at most 50, without duplicates", content = @Content(array = @ArraySchema(arraySchema = @Schema(description = "Never null; an empty array means no records. Order is insertion order in this process."), schema = @Schema(implementation = Product.class), minItems = 0, maxItems = 50, uniqueItems = true), examples = @ExampleObject(name = "empty", value = "[]")))
    @ApiResponse(responseCode = "400", description = "Limit is not an integer from 1 to 50", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "invalidLimit", summary = "limit=0", value = ApiExamples.INVALID_LIMIT)))
    public List<Product> list(@Parameter(description = "Maximum number of products; omitted value defaults to 10.", example = "10", schema = @Schema(type = "integer", format = "int32", minimum = "1", maximum = "50", defaultValue = "10")) @RequestParam(defaultValue = "10") @Min(1) @Max(50) int limit) {
        return store.list(limit);
    }

    @PatchMapping(value = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "patchProduct", summary = "Change or clear the public description", description = "Only description is accepted. {} preserves it, null clears it, and a string replaces it. Other fields and non-object bodies fail with 400.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Updated public representation", content = @Content(schema = @Schema(implementation = Product.class), examples = @ExampleObject(name = "complete", value = ApiExamples.PRODUCT))),
            @ApiResponse(responseCode = "400", description = "Invalid UUID, malformed body, unknown field or invalid description", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "unknownField", summary = "Patch attempted to supply an ID", value = ApiExamples.INVALID_PATCH))),
            @ApiResponse(responseCode = "404", description = "Product does not exist", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "missing", value = ApiExamples.MISSING))),
            @ApiResponse(responseCode = "415", description = "Request Content-Type is not application/json", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "unsupportedMedia", value = ApiExamples.UNSUPPORTED_MEDIA)))
    })
    public Product patch(
            @Parameter(description = "UUID of the product to change", required = true, example = "9d650c1e-0731-4dbf-8529-0fb50d7746ec") @PathVariable UUID id,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true, description = "Presence-aware patch document", content = @Content(schema = @Schema(implementation = ProductPatch.class), examples = {
                    @ExampleObject(name = "preserve", summary = "Leave unchanged", value = "{}"),
                    @ExampleObject(name = "clear", summary = "Remove description", value = "{\"description\":null}"),
                    @ExampleObject(name = "replace", summary = "Replace description", value = "{\"description\":\"Updated description\"}")
            }))
            @RequestBody JsonNode patch) {
        if (!patch.isObject() || patch.properties().stream().anyMatch(field -> !field.getKey().equals("description"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only the description property is accepted");
        }
        JsonNode description = patch.get("description");
        if (description != null && !description.isNull() && (!description.isString()
                || description.asString().codePointCount(0, description.asString().length()) > 200)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Description must be null or a string of at most 200 Unicode code points");
        }
        return store.patch(id, description != null, description == null || description.isNull() ? null : description.asString());
    }

    @DeleteMapping("/{id}")
    @Operation(operationId = "deleteProduct", summary = "Delete a product", description = "Removes one process-local record. A later request for the same UUID returns 404.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Deleted; no response body", content = @Content),
            @ApiResponse(responseCode = "404", description = "Product does not exist", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ApiProblem.class), examples = @ExampleObject(name = "missing", value = ApiExamples.MISSING)))
    })
    public ResponseEntity<Void> delete(@Parameter(description = "UUID of the product to delete", required = true, example = "9d650c1e-0731-4dbf-8529-0fb50d7746ec") @PathVariable UUID id) {
        store.delete(id);
        return ResponseEntity.noContent().build();
    }
}
