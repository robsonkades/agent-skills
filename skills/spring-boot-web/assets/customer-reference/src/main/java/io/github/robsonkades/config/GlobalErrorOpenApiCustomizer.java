package io.github.robsonkades.config;

import io.github.robsonkades.exception.StandardProblem;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.examples.Example;
import io.swagger.v3.oas.models.headers.Header;
import io.swagger.v3.oas.models.media.ArraySchema;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import org.springdoc.core.customizers.GlobalOpenApiCustomizer;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON_VALUE;

/** Applies the same error contract to the default OpenAPI document and every group. */
@Component
public class GlobalErrorOpenApiCustomizer implements GlobalOpenApiCustomizer {

    private static final String PROBLEM_SCHEMA = "#/components/schemas/ProblemDetail";
    private static final String RESPONSE_REF = "#/components/responses/";

    @Override
    public void customise(OpenAPI openApi) {
        if (openApi.getComponents() == null) {
            openApi.setComponents(new Components());
        }
        openApi.getComponents().addSchemas("ProblemDetail", problemSchema());
        var defaults = defaultResponses();
        defaults.forEach((status, response) -> openApi.getComponents().addResponses(componentName(status), response));

        if (openApi.getPaths() == null) {
            return;
        }
        openApi.getPaths().values().stream().flatMap(path -> path.readOperations().stream())
                .forEach(operation -> {
                    if (operation.getResponses() == null) {
                        operation.setResponses(new ApiResponses());
                    }
                    defaults.forEach((status, response) -> {
                        var specific = operation.getResponses().get(status);
                        if (specific == null) {
                            operation.getResponses().addApiResponse(status, new ApiResponse().$ref(RESPONSE_REF + componentName(status)));
                        } else {
                            complementResponse(specific, response);
                        }
                    });
                });
    }

    private static String componentName(String status) {
        return "default".equals(status) ? "DefaultError" : "Http" + status;
    }

    private static Map<String, ApiResponse> defaultResponses() {
        var responses = new LinkedHashMap<String, ApiResponse>();
        responses.put("400", response(400, """
                Requisição inválida: corpo ausente ou ilegível, falha de validação, parâmetro com formato
                incorreto, binding, multipart ou versão da API inválida/ausente. Corrija a requisição antes
                de reenviar. `errors` identifica campos ou parâmetros inválidos (`$` representa o objeto
                ou a combinação de parâmetros). `parameter`, `header`, `cookie` e `part` identificam
                entradas ausentes ou inválidas, quando disponíveis. Valores rejeitados não são expostos.
                """, StandardProblem.INVALID_REQUEST, StandardProblem.VALIDATION_ERROR,
                StandardProblem.INVALID_PARAMETER, StandardProblem.MISSING_PARAMETER,
                StandardProblem.MISSING_HEADER, StandardProblem.MISSING_COOKIE, StandardProblem.MISSING_PART,
                StandardProblem.INVALID_BODY, StandardProblem.INVALID_MULTIPART,
                StandardProblem.MISSING_API_VERSION, StandardProblem.INVALID_API_VERSION));
        responses.put("401", response(401,
                "Autenticação necessária, quando exigida pela operação. Forneça credenciais válidas.",
                StandardProblem.UNAUTHORIZED));
        responses.put("403", response(403,
                "Acesso negado, quando houver controle de autorização para a operação.", StandardProblem.FORBIDDEN));
        responses.put("404", response(404,
                "Rota ou recurso não encontrado. Verifique o caminho e o identificador informado.",
                StandardProblem.RESOURCE_NOT_FOUND));
        responses.put("405", response(405,
                "Método HTTP não permitido. Consulte `Allow` e, quando disponível, `supportedMethods`.",
                StandardProblem.METHOD_NOT_ALLOWED)
                .addHeaderObject("Allow", header("Métodos HTTP aceitos pelo recurso.", "GET, POST")));
        responses.put("406", response(406,
                "Nenhum formato de resposta atende ao cabeçalho Accept. Ajuste Accept para um formato suportado. "
                        + "`supportedMediaTypes` e `Accept` na resposta informam os formatos, quando conhecidos.",
                StandardProblem.NOT_ACCEPTABLE)
                .addHeaderObject("Accept", header("Formatos de resposta disponíveis, quando conhecidos.", "application/json")));
        responses.put("408", response(408,
                "Tempo limite da requisição excedido, quando sinalizado pelo serviço. "
                        + "Antes de repetir uma escrita, verifique se ela foi concluída.", StandardProblem.REQUEST_TIMEOUT));
        responses.put("409", response(409,
                "A operação conflita com o estado atual do recurso. Resolva o conflito antes de reenviar.",
                StandardProblem.CONFLICT));
        responses.put("410", response(410,
                "Recurso indisponível de forma permanente, quando a operação sinalizar sua remoção.",
                StandardProblem.RESOURCE_NOT_FOUND));
        responses.put("412", response(412,
                "Uma precondição HTTP não foi atendida, quando utilizada pela operação. "
                        + "Consulte o estado atual antes de reenviar.", StandardProblem.CONFLICT));
        responses.put("413", response(413,
                "Conteúdo acima do limite de upload. Reduza o conteúdo; `maxUploadSize` informa o limite "
                        + "em bytes quando conhecido. O valor do exemplo não define a configuração do serviço.",
                StandardProblem.PAYLOAD_TOO_LARGE));
        responses.put("415", response(415,
                "Content-Type não suportado. Use um dos tipos aceitos pela operação. "
                        + "`supportedMediaTypes` informa os formatos quando conhecidos.",
                StandardProblem.UNSUPPORTED_MEDIA_TYPE)
                .addHeaderObject("Accept", header("Tipos de conteúdo aceitos, quando conhecidos.", "application/json"))
                .addHeaderObject("Accept-Patch", header("Tipos aceitos para PATCH, quando aplicável.", "application/merge-patch+json")));
        responses.put("422", response(422,
                "Conteúdo semanticamente inválido, quando a operação sinalizar esse status. "
                        + "A validação padrão de entradas do Spring MVC utiliza 400.", StandardProblem.VALIDATION_ERROR));
        responses.put("429", response(429,
                "Limite de requisições excedido, quando houver controle de taxa. "
                        + "Respeite Retry-After, se informado, antes de tentar novamente.", StandardProblem.TOO_MANY_REQUESTS)
                .addHeaderObject("Retry-After", retryAfter()));
        responses.put("500", response(500,
                "Falha interna inesperada, de conversão, de configuração, de escrita ou de validação da resposta. "
                        + "A resposta padrão não expõe detalhes internos; eles são registrados no servidor.",
                StandardProblem.INTERNAL_ERROR, StandardProblem.RESPONSE_VALIDATION_ERROR));
        responses.put("502", response(502,
                "Resposta inválida de outro serviço, quando houver integração e esse status for sinalizado.",
                StandardProblem.BAD_GATEWAY));
        responses.put("503", response(503,
                "Serviço temporariamente indisponível ou timeout de processamento assíncrono. "
                        + "O timeout de WebAsyncTask utiliza 503 e `urn:problem:request-timeout`. "
                        + "Respeite Retry-After, se informado; confirme o resultado de escritas antes de repeti-las.",
                StandardProblem.SERVICE_UNAVAILABLE, StandardProblem.REQUEST_TIMEOUT)
                .addHeaderObject("Retry-After", retryAfter()));
        responses.put("504", response(504,
                "Outro serviço não respondeu a tempo, quando houver integração e esse status for sinalizado.",
                StandardProblem.GATEWAY_TIMEOUT));
        responses.put("default", response(500, """
                Outros erros HTTP seguem o mesmo Problem Details. O status do corpo corresponde ao status
                HTTP efetivo. Exceções com status explícito preservam esse status e seus cabeçalhos; tipos e
                extensões próprios são preservados. Os exemplos são ilustrativos e não limitam os status
                possíveis. Conexões encerradas ou respostas já enviadas podem impedir a escrita de um corpo.
                """, StandardProblem.INTERNAL_ERROR));
        return responses;
    }

    private static ApiResponse response(int status, String description, StandardProblem... problems) {
        var mediaType = new MediaType().schema(new Schema<>().$ref(PROBLEM_SCHEMA));
        for (var descriptor : problems) {
            var problem = descriptor.create(HttpStatusCode.valueOf(status));
            var value = new LinkedHashMap<String, Object>();
            value.put("type", problem.getType().toString());
            value.put("title", problem.getTitle());
            value.put("status", problem.getStatus());
            value.put("detail", problem.getDetail());
            value.put("instance", "/resources");
            value.putAll(exampleProperties(descriptor));
            var name = problem.getType().toString().substring("urn:problem:".length());
            mediaType.addExamples(name, new Example().summary(problem.getTitle()).value(value));
        }
        return new ApiResponse().description(description.strip())
                .content(new Content().addMediaType(APPLICATION_PROBLEM_JSON_VALUE, mediaType));
    }

    private static Map<String, Object> exampleProperties(StandardProblem problem) {
        return switch (problem) {
            case VALIDATION_ERROR -> Map.of("errors", List.of(Map.of("field", "name", "message", "O campo é obrigatório.")));
            case INVALID_PARAMETER, MISSING_PARAMETER -> Map.of("parameter", "page");
            case MISSING_HEADER -> Map.of("header", "X-Request-Id");
            case MISSING_COOKIE -> Map.of("cookie", "session");
            case MISSING_PART -> Map.of("part", "file");
            case METHOD_NOT_ALLOWED -> Map.of("supportedMethods", List.of("GET", "POST"));
            case NOT_ACCEPTABLE, UNSUPPORTED_MEDIA_TYPE -> Map.of("supportedMediaTypes", List.of("application/json"));
            case PAYLOAD_TOO_LARGE -> Map.of("maxUploadSize", 1048576L);
            default -> Map.of();
        };
    }

    private static Header header(String description, String example) {
        return new Header().description(description).required(false).schema(new StringSchema().example(example));
    }

    private static Header retryAfter() {
        return header("Espera sugerida em segundos ou uma data HTTP, quando fornecida pelo tratamento do erro.", "60");
    }

    private static void complementResponse(ApiResponse specific, ApiResponse defaults) {
        // An explicit reference is owned by its component, including references outside this document.
        if (specific.get$ref() != null) {
            return;
        }
        var description = specific.getDescription();
        if (description == null || description.isBlank()) {
            specific.setDescription(defaults.getDescription());
        } else if (!description.contains(defaults.getDescription())) {
            specific.setDescription(description + "\n\n" + defaults.getDescription());
        }
        if (specific.getContent() == null) {
            specific.setContent(new Content());
        }
        var mediaType = specific.getContent().computeIfAbsent(APPLICATION_PROBLEM_JSON_VALUE, ignored -> new MediaType());
        if (mediaType.getSchema() == null) {
            mediaType.setSchema(new Schema<>().$ref(PROBLEM_SCHEMA));
        }
        // OpenAPI forbids using both example and examples on the same media type.
        if (mediaType.getExample() == null && PROBLEM_SCHEMA.equals(mediaType.getSchema().get$ref())) {
            var examples = new LinkedHashMap<>(defaults.getContent().get(APPLICATION_PROBLEM_JSON_VALUE).getExamples());
            if (mediaType.getExamples() != null) {
                examples.putAll(mediaType.getExamples());
            }
            mediaType.setExamples(examples);
        }
        if (defaults.getHeaders() != null) {
            if (specific.getHeaders() == null) {
                specific.setHeaders(new LinkedHashMap<>());
            }
            defaults.getHeaders().forEach(specific.getHeaders()::putIfAbsent);
        }
    }

    private static ObjectSchema problemSchema() {
        var validationError = new ObjectSchema();
        validationError.addProperty("field", new StringSchema()
                .description("Campo, parâmetro ou `$` para erro do objeto/combinação.").example("address.city"));
        validationError.addProperty("message", new StringSchema()
                .description("Mensagem de validação no idioma da requisição.").example("O campo é obrigatório."));
        validationError.setRequired(List.of("field", "message"));

        var problem = new ObjectSchema();
        problem.setDescription("Erro no formato Problem Details (RFC 9457). Extensões opcionais aparecem na raiz do JSON; "
                + "não existe um objeto `properties`. Clientes devem aceitar extensões desconhecidas.");
        problem.addProperty("type", new StringSchema().format("uri")
                .description("URI estável que identifica o tipo do problema.").example("urn:problem:validation-error"));
        problem.addProperty("title", new StringSchema().description("Resumo legível do tipo de problema.")
                .example("Dados da requisição inválidos"));
        problem.addProperty("status", new IntegerSchema().format("int32").minimum(BigDecimal.valueOf(400))
                .maximum(BigDecimal.valueOf(599)).description("Mesmo status HTTP da resposta.").example(400));
        problem.addProperty("detail", new StringSchema()
                .description("Descrição desta ocorrência, sem detalhes internos para falhas inesperadas.")
                .example("Um ou mais campos da requisição são inválidos."));
        problem.addProperty("instance", new StringSchema().format("uri-reference")
                .description("URI da ocorrência; por padrão, o caminho da requisição sem a query string.").example("/resources"));
        problem.addProperty("errors", new ArraySchema().items(validationError)
                .description("Presente quando há erros de validação de campos ou parâmetros."));
        problem.addProperty("parameter", new StringSchema().description("Nome do parâmetro ausente ou inválido."));
        problem.addProperty("header", new StringSchema().description("Nome do cabeçalho obrigatório ausente."));
        problem.addProperty("cookie", new StringSchema().description("Nome do cookie obrigatório ausente."));
        problem.addProperty("part", new StringSchema().description("Nome da parte multipart obrigatória ausente."));
        problem.addProperty("supportedMethods", new ArraySchema().items(new StringSchema())
                .description("Métodos HTTP aceitos pelo recurso, quando conhecidos."));
        problem.addProperty("supportedMediaTypes", new ArraySchema().items(new StringSchema())
                .description("Tipos de conteúdo ou formatos de resposta aceitos, quando conhecidos."));
        problem.addProperty("maxUploadSize", new IntegerSchema().format("int64").minimum(BigDecimal.ZERO)
                .description("Limite de upload em bytes, quando conhecido."));
        problem.setRequired(List.of("type", "title", "status", "detail", "instance"));
        problem.setAdditionalProperties(true);
        return problem;
    }
}
