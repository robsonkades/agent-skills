package io.github.robsonkades.customer.controller;

import org.junit.jupiter.api.DisplayName;
import io.github.robsonkades.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.ConversionNotSupportedException;
import org.springframework.beans.TypeMismatchException;
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.MethodValidationException;
import org.springframework.validation.method.MethodValidationResult;
import org.springframework.validation.method.ParameterValidationResult;
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
import org.springframework.web.bind.UnsatisfiedServletRequestParameterException;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentConversionNotSupportedException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTests {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @ParameterizedTest(name = "{0}")
    @DisplayName("Defaults follow the API contract")
    @MethodSource("defaultExceptions")
    void defaultsFollowTheApiContract(DefaultFailure failure) throws Exception {
        var request = new MockHttpServletRequest("GET", "/resource");
        request.setQueryString("token=internal-secret");

        var response = handler.handleException(failure.exception(), new ServletWebRequest(request));

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode().value()).isEqualTo(failure.status());
        assertThat(response.getBody()).isInstanceOf(ProblemDetail.class);
        var problem = (ProblemDetail) response.getBody();
        assertThat(problem.getType()).isEqualTo(URI.create("urn:problem:" + failure.type()));
        assertThat(problem.getTitle()).isEqualTo(failure.title());
        assertThat(problem.getStatus()).isEqualTo(failure.status());
        assertThat(problem.getDetail()).isNotBlank().doesNotContain("internal-secret");
        assertThat(problem.getInstance()).isEqualTo(URI.create("/resource"));
    }

    private static Stream<DefaultFailure> defaultExceptions() throws Exception {
        var parameter = parameter(0);
        var binding = new BeanPropertyBindingResult(new Object(), "request");
        binding.addError(new FieldError("request", "name", "O nome é obrigatório."));
        return Stream.of(
                failure(new HttpRequestMethodNotSupportedException("DELETE", List.of("GET")), 405, "method-not-allowed", "Método HTTP não permitido"),
                failure(new HttpMediaTypeNotSupportedException(MediaType.TEXT_PLAIN, List.of(MediaType.APPLICATION_JSON)), 415, "unsupported-media-type", "Tipo de conteúdo não suportado"),
                failure(new HttpMediaTypeNotSupportedException("internal-secret"), 415, "unsupported-media-type", "Tipo de conteúdo não suportado"),
                failure(new HttpMediaTypeNotAcceptableException(List.of(MediaType.APPLICATION_JSON)), 406, "not-acceptable", "Formato de resposta não suportado"),
                failure(new HttpMediaTypeNotAcceptableException("internal-secret"), 406, "not-acceptable", "Formato de resposta não suportado"),
                failure(new MissingPathVariableException("id", parameter), 500, "internal-server-error", "Erro interno do servidor"),
                failure(new MissingPathVariableException("id", parameter, true), 400, "invalid-parameter", "Parâmetro inválido"),
                failure(new MissingServletRequestParameterException("page", "int"), 400, "missing-parameter", "Parâmetro obrigatório ausente"),
                failure(new MissingRequestHeaderException("X-Request-Id", parameter), 400, "missing-header", "Cabeçalho obrigatório ausente"),
                failure(new MissingRequestCookieException("session", parameter), 400, "missing-cookie", "Cookie obrigatório ausente"),
                failure(new MissingMatrixVariableException("version", parameter), 400, "missing-parameter", "Parâmetro obrigatório ausente"),
                failure(new MissingServletRequestPartException("document"), 400, "missing-part", "Parte obrigatória ausente"),
                failure(new ServletRequestBindingException("internal-secret"), 400, "invalid-request", "Requisição inválida"),
                failure(new UnsatisfiedServletRequestParameterException(new String[]{"mode=full"}, Map.of("mode", new String[]{"internal-secret"})), 400, "invalid-request", "Requisição inválida"),
                failure(new MethodArgumentNotValidException(parameter, binding), 400, "validation-error", "Dados da requisição inválidos"),
                failure(new HandlerMethodValidationException(validationResult(0)), 400, "validation-error", "Dados da requisição inválidos"),
                failure(new HandlerMethodValidationException(validationResult(-1)), 500, "response-validation-error", "Falha na validação da resposta"),
                failure(new NoHandlerFoundException("GET", "/missing", HttpHeaders.EMPTY), 404, "resource-not-found", "Recurso não encontrado"),
                failure(new NoResourceFoundException(HttpMethod.GET, "/missing", "internal-secret"), 404, "resource-not-found", "Recurso não encontrado"),
                failure(new AsyncRequestTimeoutException(), 503, "request-timeout", "Tempo limite da requisição excedido"),
                failure(new MaxUploadSizeExceededException(1024), 413, "payload-too-large", "Conteúdo excede o limite permitido"),
                failure(new ConversionNotSupportedException("internal-secret", UUID.class, new IllegalArgumentException()), 500, "internal-server-error", "Erro interno do servidor"),
                failure(new MethodArgumentConversionNotSupportedException("internal-secret", UUID.class, "id", parameter, new IllegalArgumentException()), 500, "internal-server-error", "Erro interno do servidor"),
                failure(new TypeMismatchException("internal-secret", UUID.class), 400, "invalid-parameter", "Parâmetro inválido"),
                failure(new MethodArgumentTypeMismatchException("internal-secret", UUID.class, "id", parameter, new IllegalArgumentException()), 400, "invalid-parameter", "Parâmetro inválido"),
                failure(new HttpMessageNotReadableException("internal-secret", new MockHttpInputMessage(new byte[0])), 400, "invalid-request-body", "Corpo da requisição inválido"),
                failure(new HttpMessageNotWritableException("internal-secret"), 500, "internal-server-error", "Erro interno do servidor"),
                failure(new MethodValidationException(validationResult(-1)), 500, "response-validation-error", "Falha na validação da resposta"),
                failure(new MissingApiVersionException(), 400, "missing-api-version", "Versão da API ausente"),
                failure(new InvalidApiVersionException("internal-secret"), 400, "invalid-api-version", "Versão da API inválida"),
                failure(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "internal-secret"), 503, "service-unavailable", "Serviço indisponível"));
    }

    @Test
    @DisplayName("Response status preserves its headers")
    void responseStatusPreservesItsHeaders() throws Exception {
        var headers = new HttpHeaders();
        headers.set(HttpHeaders.RETRY_AFTER, "60");
        var exception = new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "internal-secret") {
            @Override
            public HttpHeaders getHeaders() {
                return headers;
            }
        };

        var response = handler.handleException(exception, new ServletWebRequest(new MockHttpServletRequest("GET", "/resource")));

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("60");
        assertThat(((ProblemDetail) response.getBody()).getType()).isEqualTo(URI.create("urn:problem:too-many-requests"));
    }

    @Test
    @DisplayName("Annotated status is not converted to internal server error")
    void annotatedStatusIsNotConvertedToInternalServerError() {
        var response = handler.handleUnexpectedException(new ForbiddenOperation(),
                new ServletWebRequest(new MockHttpServletRequest("GET", "/resource")));

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(((ProblemDetail) response.getBody()).getType()).isEqualTo(URI.create("urn:problem:forbidden"));
    }

    @Test
    @DisplayName("Malformed multipart returns bad request")
    void malformedMultipartReturnsBadRequest() {
        var response = handler.handleMultipartException(new MultipartException("internal-secret"),
                new ServletWebRequest(new MockHttpServletRequest("POST", "/resource")));

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(((ProblemDetail) response.getBody()).getType()).isEqualTo(URI.create("urn:problem:invalid-multipart"));
    }

    @Test
    @DisplayName("Known upload limit is included and unknown limit is omitted")
    void knownUploadLimitIsIncludedAndUnknownLimitIsOmitted() throws Exception {
        var request = new ServletWebRequest(new MockHttpServletRequest("POST", "/resource"));
        var known = handler.handleException(new MaxUploadSizeExceededException(1024), request);
        var unknown = handler.handleException(new MaxUploadSizeExceededException(-1), request);

        assertThat(known).isNotNull();
        assertThat(((ProblemDetail) known.getBody()).getProperties()).containsEntry("maxUploadSize", 1024L);
        assertThat(unknown).isNotNull();
        assertThat(((ProblemDetail) unknown.getBody()).getProperties()).isNull();
    }

    @Test
    @DisplayName("Disconnected async request does not attempt to write another response")
    void disconnectedAsyncRequestDoesNotAttemptToWriteAnotherResponse() throws Exception {
        var response = handler.handleException(new AsyncRequestNotUsableException("Connection closed"),
                new ServletWebRequest(new MockHttpServletRequest()));

        assertThat(response).isNull();
    }

    @Test
    @DisplayName("Committed response is not replaced")
    void committedResponseIsNotReplaced() throws Exception {
        var servletResponse = new MockHttpServletResponse();
        servletResponse.setCommitted(true);

        var response = handler.handleException(new AsyncRequestTimeoutException(),
                new ServletWebRequest(new MockHttpServletRequest(), servletResponse));

        assertThat(response).isNull();
        assertThat(servletResponse.getContentAsByteArray()).isEmpty();
    }

    private static MethodParameter parameter(int index) throws Exception {
        return new MethodParameter(ValidationTarget.class.getDeclaredMethod("value", String.class), index);
    }

    private static MethodValidationResult validationResult(int index) throws Exception {
        var parameter = parameter(index);
        var errors = List.of(new DefaultMessageSourceResolvable(new String[]{"NotBlank"}, "Campo obrigatório."));
        var result = new ParameterValidationResult(parameter, "internal-secret", errors, null, null, null,
                (error, type) -> error);
        return MethodValidationResult.create(new ValidationTarget(), parameter.getMethod(), List.of(result));
    }

    private static DefaultFailure failure(Exception exception, int status, String type, String title) {
        return new DefaultFailure(exception, status, type, title);
    }

    private record DefaultFailure(Exception exception, int status, String type, String title) {
        @Override
        public String toString() {
            return exception.getClass().getSimpleName() + " -> " + status;
        }
    }

    private static class ValidationTarget {
        String value(String value) {
            return value;
        }
    }

    @ResponseStatus(HttpStatus.FORBIDDEN)
    private static class ForbiddenOperation extends RuntimeException {
    }
}
