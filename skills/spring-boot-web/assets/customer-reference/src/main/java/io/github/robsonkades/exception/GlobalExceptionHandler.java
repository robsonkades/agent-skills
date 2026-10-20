package io.github.robsonkades.exception;

import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.ErrorResponse;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingMatrixVariableException;
import org.springframework.web.bind.MissingRequestCookieException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(Exception.class)
    public @Nullable ResponseEntity<Object> handleUnexpectedException(final Exception exception, final WebRequest request) {
        if (exception instanceof ErrorResponse error) {
            return handleExceptionInternal(exception, null, error.getHeaders(), error.getStatusCode(), request);
        }
        var responseStatus = AnnotatedElementUtils.findMergedAnnotation(exception.getClass(), ResponseStatus.class);
        var status = responseStatus != null ? responseStatus.code() : HttpStatus.INTERNAL_SERVER_ERROR;
        return handleExceptionInternal(exception, null, HttpHeaders.EMPTY, status, request);
    }

    @ExceptionHandler(MultipartException.class)
    public @Nullable ResponseEntity<Object> handleMultipartException(final MultipartException exception, final WebRequest request) {
        return handleExceptionInternal(exception, null, HttpHeaders.EMPTY, HttpStatus.BAD_REQUEST, request);
    }

    @Override
    protected @Nullable ResponseEntity<Object> handleMethodArgumentNotValid(final MethodArgumentNotValidException exception, @NonNull final HttpHeaders headers, @NonNull final HttpStatusCode status, @NonNull final WebRequest request) {
        var errors = exception.getBindingResult()
                .getAllErrors()
                .stream()
                .map(error -> validationError(error instanceof FieldError fieldError ? fieldError.getField() : "$", error))
                .toList();
        addValidationErrors(exception.getBody(), errors);
        return super.handleMethodArgumentNotValid(exception, headers, status, request);
    }

    @Override
    protected @Nullable ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException exception, @NonNull HttpHeaders headers, @NonNull HttpStatusCode status, @NonNull WebRequest request) {
        if (!exception.isForReturnValue()) {
            var errors = new ArrayList<>(exception.getParameterValidationResults().stream()
                    .flatMap(result -> result
                            .getResolvableErrors()
                            .stream()
                            .map(error -> validationError(error instanceof FieldError fieldError ? fieldError.getField() : result.getMethodParameter().getParameterName(), error)))
                    .toList());
            exception.getCrossParameterValidationResults().stream()
                    .map(error -> validationError("$", error))
                    .forEach(errors::add);
            addValidationErrors(exception.getBody(), errors);
        }
        return super.handleHandlerMethodValidationException(exception, headers, status, request);
    }

    @Override
    protected @Nullable ResponseEntity<Object> handleExceptionInternal(@NonNull final Exception exception, @Nullable final Object body, @NonNull HttpHeaders headers, @NonNull HttpStatusCode status, @NonNull WebRequest request) {
        var problem = body instanceof ProblemDetail detail ? detail
                : exception instanceof ErrorResponse error
                        ? error.updateAndGetBody(getMessageSource(), LocaleContextHolder.getLocale())
                        : ProblemDetail.forStatus(status);
        if (StandardProblem.hasDefaultType(problem)) {
            StandardProblem.forException(exception, status).applyTo(problem);
        }
        addExceptionProperties(problem, exception);
        if (status.is5xxServerError()) {
            LOGGER.error("Erro ao processar a requisição.", exception);
        }
        return super.handleExceptionInternal(exception, problem, headers, status, request);
    }

    @Override
    protected @NullMarked ResponseEntity<Object> createResponseEntity(@Nullable final Object body, final HttpHeaders headers, final HttpStatusCode statusCode, final WebRequest request) {
        var problem = body instanceof ProblemDetail detail ? detail : ProblemDetail.forStatus(statusCode);
        problem.setStatus(statusCode.value());
        var defaults = StandardProblem
                .forStatus(statusCode)
                .create(statusCode);
        if (StandardProblem.hasDefaultType(problem)) {
            StandardProblem.forStatus(statusCode).applyTo(problem);
        }
        if (problem.getTitle() == null || problem.getTitle().isBlank()) {
            problem.setTitle(defaults.getTitle());
        }
        if (problem.getDetail() == null || problem.getDetail().isBlank()) {
            problem.setDetail(defaults.getDetail());
        }
        if (problem.getInstance() == null) {
            var servletRequest = ((ServletWebRequest) request).getRequest();
            problem.setInstance(URI.create(servletRequest.getRequestURI()));
        }
        return super.createResponseEntity(problem, headers, statusCode, request);
    }

    private static void addExceptionProperties(final ProblemDetail problem, final Exception exception) {
        switch (exception) {
            case HttpRequestMethodNotSupportedException method -> {
                if (method.getSupportedMethods() != null) {
                    problem.setProperty("supportedMethods", List.of(method.getSupportedMethods()));
                }
            }
            case HttpMediaTypeNotSupportedException media -> addSupportedMediaTypes(problem, media.getSupportedMediaTypes());
            case HttpMediaTypeNotAcceptableException media -> addSupportedMediaTypes(problem, media.getSupportedMediaTypes());
            case MissingServletRequestParameterException parameter -> problem.setProperty("parameter", parameter.getParameterName());
            case MissingRequestHeaderException header -> problem.setProperty("header", header.getHeaderName());
            case MissingRequestCookieException cookie -> problem.setProperty("cookie", cookie.getCookieName());
            case MissingMatrixVariableException variable -> problem.setProperty("parameter", variable.getVariableName());
            case MissingServletRequestPartException part -> problem.setProperty("part", part.getRequestPartName());
            case MethodArgumentTypeMismatchException parameter -> problem.setProperty("parameter", parameter.getName());
            case MaxUploadSizeExceededException upload -> {
                if (upload.getMaxUploadSize() >= 0) {
                    problem.setProperty("maxUploadSize", upload.getMaxUploadSize());
                }
            }
            default -> { }
        }
    }

    private static void addSupportedMediaTypes(final ProblemDetail problem, final List<MediaType> mediaTypes) {
        if (!mediaTypes.isEmpty()) {
            problem.setProperty("supportedMediaTypes", mediaTypes.stream().map(MediaType::toString).toList());
        }
    }

    private static void addValidationErrors(final ProblemDetail problem, final List<ValidationError> errors) {
        StandardProblem.VALIDATION_ERROR.applyTo(problem);
        if (!errors.isEmpty()) {
            problem.setProperty("errors", errors);
        }
    }

    private static ValidationError validationError(@Nullable final String field, final MessageSourceResolvable error) {
        var message = error.getDefaultMessage();
        return new ValidationError(field != null ? field : "$", message != null && !message.isBlank() ? message : "Valor inválido.");
    }

    private record ValidationError(String field, String message) {}
}
