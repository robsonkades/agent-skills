package io.github.robsonkades.exception;

import org.springframework.beans.ConversionNotSupportedException;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.validation.method.MethodValidationException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.accept.InvalidApiVersionException;
import org.springframework.web.accept.MissingApiVersionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingMatrixVariableException;
import org.springframework.web.bind.MissingPathVariableException;
import org.springframework.web.bind.MissingRequestCookieException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.net.URI;

public enum StandardProblem {

    INVALID_REQUEST("invalid-request", "Requisição inválida", "Verifique os dados enviados na requisição."),
    VALIDATION_ERROR("validation-error", "Dados da requisição inválidos", "Um ou mais campos da requisição são inválidos."),
    INVALID_PARAMETER("invalid-parameter", "Parâmetro inválido", "Um parâmetro da requisição possui formato inválido."),
    MISSING_PARAMETER("missing-parameter", "Parâmetro obrigatório ausente", "Informe os parâmetros obrigatórios da requisição."),
    MISSING_HEADER("missing-header", "Cabeçalho obrigatório ausente", "Informe os cabeçalhos obrigatórios da requisição."),
    MISSING_COOKIE("missing-cookie", "Cookie obrigatório ausente", "Informe os cookies obrigatórios da requisição."),
    MISSING_PART("missing-part", "Parte obrigatória ausente", "Envie todas as partes obrigatórias da requisição multipart."),
    INVALID_BODY("invalid-request-body", "Corpo da requisição inválido", "Envie um corpo válido no formato esperado pela operação."),
    INVALID_MULTIPART("invalid-multipart", "Requisição multipart inválida", "Não foi possível ler as partes da requisição multipart."),
    METHOD_NOT_ALLOWED("method-not-allowed", "Método HTTP não permitido", "O método HTTP não é aceito para este recurso."),
    UNSUPPORTED_MEDIA_TYPE("unsupported-media-type", "Tipo de conteúdo não suportado", "Envie o corpo em um dos tipos de conteúdo aceitos pela operação."),
    NOT_ACCEPTABLE("not-acceptable", "Formato de resposta não suportado", "Solicite um dos formatos de resposta aceitos pela operação."),
    RESOURCE_NOT_FOUND("resource-not-found", "Recurso não encontrado", "O recurso solicitado não foi encontrado."),
    PAYLOAD_TOO_LARGE("payload-too-large", "Conteúdo excede o limite permitido", "O tamanho do conteúdo enviado excede o limite permitido."),
    REQUEST_TIMEOUT("request-timeout", "Tempo limite da requisição excedido", "Não foi possível concluir a requisição dentro do tempo limite."),
    MISSING_API_VERSION("missing-api-version", "Versão da API ausente", "Informe a versão da API para esta operação."),
    INVALID_API_VERSION("invalid-api-version", "Versão da API inválida", "Informe uma versão da API aceita por esta operação."),
    RESPONSE_VALIDATION_ERROR("response-validation-error", "Falha na validação da resposta", "Não foi possível gerar uma resposta válida para a requisição."),
    INTERNAL_ERROR("internal-server-error", "Erro interno do servidor", "Ocorreu um erro inesperado ao processar a requisição."),
    UNAUTHORIZED("unauthorized", "Autenticação necessária", "Autentique-se para acessar este recurso."),
    FORBIDDEN("forbidden", "Acesso não permitido", "Você não tem permissão para acessar este recurso."),
    CONFLICT("conflict", "Conflito na operação", "A operação conflita com o estado atual do recurso."),
    TOO_MANY_REQUESTS("too-many-requests", "Limite de requisições excedido", "O limite de requisições foi excedido. Tente novamente mais tarde."),
    SERVICE_UNAVAILABLE("service-unavailable", "Serviço indisponível", "O serviço está temporariamente indisponível."),
    BAD_GATEWAY("bad-gateway", "Falha na comunicação com outro serviço", "Não foi possível obter uma resposta válida de outro serviço."),
    GATEWAY_TIMEOUT("gateway-timeout", "Tempo limite de outro serviço excedido", "Outro serviço não respondeu dentro do tempo limite.");

    private final URI type;
    private final String title;
    private final String detail;

    StandardProblem(String type, String title, String detail) {
        this.type = URI.create("urn:problem:" + type);
        this.title = title;
        this.detail = detail;
    }

    static StandardProblem forException(Exception exception, HttpStatusCode status) {
        return switch (exception) {
            case HttpRequestMethodNotSupportedException ignored -> METHOD_NOT_ALLOWED;
            case HttpMediaTypeNotSupportedException ignored -> UNSUPPORTED_MEDIA_TYPE;
            case HttpMediaTypeNotAcceptableException ignored -> NOT_ACCEPTABLE;
            case MissingPathVariableException ignored -> status.is5xxServerError() ? INTERNAL_ERROR : INVALID_PARAMETER;
            case MissingServletRequestParameterException ignored -> MISSING_PARAMETER;
            case MissingRequestHeaderException ignored -> MISSING_HEADER;
            case MissingRequestCookieException ignored -> MISSING_COOKIE;
            case MissingMatrixVariableException ignored -> MISSING_PARAMETER;
            case MissingServletRequestPartException ignored -> MISSING_PART;
            case ServletRequestBindingException ignored -> INVALID_REQUEST;
            case MethodArgumentNotValidException ignored -> VALIDATION_ERROR;
            case HandlerMethodValidationException validation -> validation.isForReturnValue() ? RESPONSE_VALIDATION_ERROR : VALIDATION_ERROR;
            case NoHandlerFoundException ignored -> RESOURCE_NOT_FOUND;
            case NoResourceFoundException ignored -> RESOURCE_NOT_FOUND;
            case AsyncRequestTimeoutException ignored -> REQUEST_TIMEOUT;
            case MaxUploadSizeExceededException ignored -> PAYLOAD_TOO_LARGE;
            case MultipartException ignored -> INVALID_MULTIPART;
            case ConversionNotSupportedException ignored -> INTERNAL_ERROR;
            case TypeMismatchException ignored -> INVALID_PARAMETER;
            case HttpMessageNotReadableException ignored -> INVALID_BODY;
            case HttpMessageNotWritableException ignored -> INTERNAL_ERROR;
            case MethodValidationException ignored -> RESPONSE_VALIDATION_ERROR;
            case MissingApiVersionException ignored -> MISSING_API_VERSION;
            case InvalidApiVersionException ignored -> INVALID_API_VERSION;
            default -> forStatus(status);
        };
    }

    static StandardProblem forStatus(HttpStatusCode status) {
        return switch (status.value()) {
            case 400 -> INVALID_REQUEST;
            case 401 -> UNAUTHORIZED;
            case 403 -> FORBIDDEN;
            case 404, 410 -> RESOURCE_NOT_FOUND;
            case 405 -> METHOD_NOT_ALLOWED;
            case 406 -> NOT_ACCEPTABLE;
            case 408 -> REQUEST_TIMEOUT;
            case 409, 412 -> CONFLICT;
            case 413 -> PAYLOAD_TOO_LARGE;
            case 415 -> UNSUPPORTED_MEDIA_TYPE;
            case 422 -> VALIDATION_ERROR;
            case 429 -> TOO_MANY_REQUESTS;
            case 502 -> BAD_GATEWAY;
            case 503 -> SERVICE_UNAVAILABLE;
            case 504 -> GATEWAY_TIMEOUT;
            default -> status.is5xxServerError() ? INTERNAL_ERROR : INVALID_REQUEST;
        };
    }

    static boolean hasDefaultType(ProblemDetail problem) {
        return problem.getType() == null || URI.create("about:blank").equals(problem.getType());
    }

    public ProblemDetail create(HttpStatusCode status) {
        var problem = ProblemDetail.forStatus(status);
        applyTo(problem);
        return problem;
    }

    void applyTo(ProblemDetail problem) {
        problem.setType(type);
        problem.setTitle(title);
        problem.setDetail(detail);
    }
}
