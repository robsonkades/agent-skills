package io.github.robsonkades.customer.controller.documentation;

import io.github.robsonkades.customer.controller.dto.CustomerPageResponse;
import io.github.robsonkades.customer.controller.dto.CustomerPatchRequest;
import io.github.robsonkades.customer.controller.dto.CustomerRequest;
import io.github.robsonkades.customer.controller.dto.CustomerResponse;
import io.github.robsonkades.customer.controller.dto.CustomerSearchRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.links.Link;
import io.swagger.v3.oas.annotations.links.LinkParameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.context.request.async.WebAsyncTask;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

@RequestMapping(path = "/customers", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Customers", description = "Cadastro, consulta e atualização de clientes.")
public interface CustomerApi {

    String MERGE_PATCH_JSON = "application/merge-patch+json";

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createCustomer",
            summary = "Criar cliente",
            description = """
                    Cria um cliente e gera seu identificador UUID. Todos os campos da raiz e
                    todos os campos do endereço, exceto complement, são obrigatórios e não aceitam null.
                    Retorna o cliente normalizado e sua URI no cabeçalho Location.
                    """,
            responses = @ApiResponse(
                    responseCode = "201",
                    description = "Cliente criado.",
                    headers = @Header(
                            name = "Location",
                            description = "URI absoluta do cliente criado, incluindo o contexto da aplicação.",
                            required = true,
                            schema = @Schema(type = "string", format = "uri", example = "https://api.example.com/customers/8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510")),
                    content = @Content(
                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = CustomerResponse.class),
                            examples = @ExampleObject(name = "Cliente criado", value = CustomerApiExamples.CUSTOMER_RESPONSE)),
                    links = @Link(
                            name = "consultarCliente",
                            operationId = "getCustomerById",
                            description = "Consulta o cliente criado usando o ID retornado no corpo da resposta.",
                            parameters = @LinkParameter(name = "customerId", expression = "$response.body#/id"))))
    @InvalidCustomerResponse
    @ApiRequestBody(
            required = true,
            description = "Dados completos do cliente. CPF com ou sem pontuação; data no formato AAAA-MM-DD.",
            content = @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = CustomerRequest.class),
                    examples = @ExampleObject(name = "Novo cliente", value = CustomerApiExamples.CUSTOMER)))
    WebAsyncTask<ResponseEntity<CustomerResponse>> createCustomer(@Valid @RequestBody CustomerRequest customerRequest);

    @GetMapping
    @Operation(
            operationId = "listCustomers",
            summary = "Listar clientes",
            description = """
                    Filtros textuais são parciais, ignoram maiúsculas/minúsculas e são combinados com AND.
                    Filtros omitidos, vazios ou apenas com espaços são ignorados; espaços nas extremidades
                    dos valores são removidos antes da comparação. Ordena por nome crescente, com UUID
                    crescente para desempate. Sem resultados ou com página além do final, retorna 200
                    com content vazio. Para filtros exatos, datas e ordenação, use POST /customers/search.
                    """)
    @ApiResponse(responseCode = "200", description = "Página de clientes e totais da consulta.",
            content = @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = CustomerPageResponse.class),
                    examples = {
                            @ExampleObject(name = "Página com resultados", value = CustomerApiExamples.CUSTOMER_PAGE_RESPONSE),
                            @ExampleObject(name = "Nenhum resultado", value = CustomerApiExamples.EMPTY_PAGE_RESPONSE),
                            @ExampleObject(name = "Página além do final", description = "A página solicitada está vazia, mas os totais continuam descrevendo todos os resultados.", value = CustomerApiExamples.OUT_OF_RANGE_PAGE_RESPONSE)
                    }))
    WebAsyncTask<ResponseEntity<CustomerPageResponse>> listCustomers(
            @Parameter(
                    description = "Nome parcial do cliente. Opcional; vazio ou somente espaços é ignorado.",
                    schema = @Schema(type = "string", maxLength = 100),
                    example = "ana")
            @RequestParam(required = false) @Size(max = 100) String name,
            @Parameter(
                    description = "E-mail parcial do cliente. Opcional; não exige formato de e-mail completo.",
                    schema = @Schema(type = "string", maxLength = 254),
                    example = "example.com")
            @RequestParam(required = false) @Size(max = 254) String email,
            @Parameter(
                    description = "Telefone parcial em texto livre. Opcional; vazio ou somente espaços é ignorado.",
                    schema = @Schema(type = "string", maxLength = 50),
                    example = "+5511")
            @RequestParam(required = false) @Size(max = 50) String phone,
            @Parameter(
                    description = "Trecho do CPF armazenado somente com números. Opcional; a busca não remove pontuação.",
                    schema = @Schema(type = "string", maxLength = 11),
                    example = "529")
            @RequestParam(required = false) @Size(max = 11) String cpf,
            @Parameter(
                    description = "Índice da página, começando em zero. Omissão ou valor vazio usam 0.",
                    schema = @Schema(type = "integer", format = "int32", minimum = "0", defaultValue = "0"),
                    example = "0")
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @Parameter(
                    description = "Itens por página, de 1 a 100. Omissão ou valor vazio usam 20.", required = false,
                    schema = @Schema(type = "integer", format = "int32", minimum = "1", maximum = "100", defaultValue = "20"),
                    example = "20")
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size);

    @PostMapping(path = "/search", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "customers:search",
            summary = "Buscar clientes",
            description = """
                    Combina os critérios informados com AND. _discriminator identifica o tipo de filtro,
                    como cpf, email ou name. Filtros textuais aceitam operator contains e exact (padrão);
                    birthDateRange define um intervalo inclusivo. Ordenação aceita name, email, birthDate e city.
                    Até 20 filtros e 3 critérios de ordenação. Todos os campos do corpo são opcionais;
                    {} usa página 0, tamanho 20 e ordem name ASC. UUID crescente sempre desempata.
                    Não encontrar clientes ou solicitar página além do final retorna 200 com content vazio.
                    """)
    @ApiResponse(
            responseCode = "200",
            description = "Página de clientes correspondente aos critérios.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = CustomerPageResponse.class),
                    examples = {
                            @ExampleObject(name = "Página com resultados", value = CustomerApiExamples.CUSTOMER_PAGE_RESPONSE),
                            @ExampleObject(name = "Nenhum resultado", value = CustomerApiExamples.EMPTY_PAGE_RESPONSE),
                            @ExampleObject(name = "Página além do final", description = "A página solicitada está vazia, mas os totais continuam descrevendo todos os resultados.", value = CustomerApiExamples.OUT_OF_RANGE_PAGE_RESPONSE)
                    }))
    @InvalidCustomerResponse
    @ApiRequestBody(
            required = true,
            description = "Critérios opcionais de busca, paginação e ordenação.",
            content = @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = CustomerSearchRequest.class),
                    examples = {
                            @ExampleObject(name = "Busca por CPF", value = CustomerApiExamples.SEARCH_BY_CPF),
                            @ExampleObject(name = "Busca por CPF e e-mail", value = CustomerApiExamples.SEARCH_BY_CPF_AND_EMAIL),
                            @ExampleObject(name = "Busca por perfil e localização", value = CustomerApiExamples.SEARCH_BY_PROFILE_AND_LOCATION)
                    })
    )
    WebAsyncTask<ResponseEntity<CustomerPageResponse>> searchCustomers(@Valid @RequestBody CustomerSearchRequest request);

    @GetMapping("/{customerId}")
    @Operation(operationId = "getCustomerById", summary = "Consultar cliente por ID",
            description = "Retorna os dados completos do cliente. UUID inválido gera 400; cliente inexistente gera 404.")
    @ApiResponse(
            responseCode = "200",
            description = "Cliente encontrado.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = CustomerResponse.class),
                    examples = @ExampleObject(name = "Cliente encontrado", value = CustomerApiExamples.CUSTOMER_RESPONSE)))
    @CustomerNotFoundResponse
    WebAsyncTask<ResponseEntity<CustomerResponse>> getCustomerById(
            @Parameter(
                    description = "UUID obrigatório do cliente.",
                    required = true,
                    schema = @Schema(type = "string", format = "uuid"),
                    example = "8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510")
            @PathVariable UUID customerId);

    @PutMapping(path = "/{customerId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "replaceCustomer",
            summary = "Substituir cliente",
            description = """
                    Substitui todos os dados do cliente existente, preservando seu UUID.
                    Exige os mesmos campos e validações da criação. Omitir complement remove o valor anterior.
                    Não cria um cliente quando o UUID não existe; retorna 404.
                    """
    )
    @ApiResponse(
            responseCode = "200",
            description = "Dados do cliente substituídos.",
            content = @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = CustomerResponse.class),
                    examples = @ExampleObject(name = "Cliente substituído", value = CustomerApiExamples.CUSTOMER_RESPONSE)))
    @CustomerNotFoundResponse
    @InvalidCustomerResponse
    @ApiRequestBody(
            required = true,
            description = "Representação completa para substituir os dados do cliente.",
            content = @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = CustomerRequest.class),
                    examples = @ExampleObject(name = "Cliente atualizado", value = CustomerApiExamples.CUSTOMER)))
    WebAsyncTask<ResponseEntity<CustomerResponse>> replaceCustomer(
            @Parameter(
                    description = "UUID obrigatório do cliente.",
                    required = true,
                    schema = @Schema(type = "string", format = "uuid"),
                    example = "8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510")
            @PathVariable UUID customerId,
            @Valid @RequestBody CustomerRequest customerRequest);

    @PatchMapping(path = "/{customerId}", consumes = MERGE_PATCH_JSON)
    @Operation(operationId = "patchCustomer", summary = "Atualizar parcialmente cliente",
            description = """
                    Aceita JSON Merge Patch (RFC 7396).
                    Campos omitidos ficam inalterados; campos obrigatórios não podem ser definidos como null.
                    O objeto address deve ser enviado completo quando atualizado.
                    Exige ao menos um campo; propriedades desconhecidas são rejeitadas.
                    PATCH não aplica os limites de tamanho de POST/PUT e aceita nascimento na data de hoje.
                    Confira CustomerPatchRequest para as regras específicas de cada campo.
                    """)
    @ApiResponse(responseCode = "200", description = "Dados do cliente atualizados.",
            content = @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = CustomerResponse.class),
                    examples = @ExampleObject(name = "Cliente sem complemento", description = "Resultado de Remover complemento do endereço aplicado ao cliente do exemplo de criação.", value = CustomerApiExamples.CUSTOMER_WITHOUT_COMPLEMENT_RESPONSE)))
    @CustomerNotFoundResponse
    @InvalidCustomerResponse
    @ApiRequestBody(
            required = true,
            description = "Objeto JSON com campos do cliente; address deve estar completo quando enviado.",
            content = @Content(mediaType = MERGE_PATCH_JSON,
                    schema = @Schema(implementation = CustomerPatchRequest.class),
                    examples = {
                            @ExampleObject(name = "Atualizar telefone", value = CustomerApiExamples.PHONE_PATCH),
                            @ExampleObject(name = "Remover complemento do endereço", description = "Envie o endereço completo com complement igual a null. Os demais dados do cliente são preservados.", value = CustomerApiExamples.REMOVE_ADDRESS_COMPLEMENT_PATCH)
                    }))
    WebAsyncTask<ResponseEntity<CustomerResponse>> patchCustomer(
            @Parameter(
                    description = "UUID obrigatório do cliente.",
                    required = true,
                    schema = @Schema(type = "string", format = "uuid"),
                    example = "8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510")
            @PathVariable UUID customerId,
            @RequestBody JsonNode patchDocument);
}
