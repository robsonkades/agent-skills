package example.web;

import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.TypeMismatchException;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import static example.web.Models.Violation;

/** This policy owns MVC exceptions, not failures before DispatcherServlet. */
@RestControllerAdvice
public final class ApiErrors extends ResponseEntityExceptionHandler {
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<Violation> violations = exception.getBindingResult().getAllErrors().stream()
                .map(ApiErrors::violation).toList();
        return validationFailure(exception, violations, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        if (exception.isForReturnValue()) {
            logger.error("MVC response validation failed for " + exception.getMethod().getName());
            return handleExceptionInternal(exception,
                    ProblemDetail.forStatusAndDetail(status, "Response validation failed"), headers, status, request);
        }
        List<Violation> violations = new ArrayList<>();
        for (var result : exception.getParameterValidationResults()) {
            if (result instanceof ParameterErrors errors) {
                errors.getAllErrors().stream().map(ApiErrors::violation).forEach(violations::add);
            } else {
                var parameter = result.getMethodParameter();
                var query = parameter.getParameterAnnotation(RequestParam.class);
                String field = parameter.getParameterName();
                if (query != null && !query.name().isBlank()) field = query.name();
                else if (query != null && !query.value().isBlank()) field = query.value();
                if (field == null) field = "request";
                String publicField = field;
                result.getResolvableErrors().forEach(error -> violations.add(new Violation(publicField, message(error))));
            }
        }
        exception.getCrossParameterValidationResults().forEach(error -> violations.add(new Violation("request", message(error))));
        return validationFailure(exception, violations, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleTypeMismatch(TypeMismatchException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        // The framework's default detail may echo a rejected parameter value.
        return handleExceptionInternal(exception,
                ProblemDetail.forStatusAndDetail(status, "Invalid request parameter"), headers, status, request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> unexpected(Exception exception, WebRequest request) {
        // Known framework exceptions still select inherited, more-specific handlers.
        // Internal diagnostics only; the fixture has no credentials or production payloads.
        logger.error("Unexpected MVC failure", exception);
        return handleExceptionInternal(exception,
                ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected server error"),
                new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR, request);
    }

    private ResponseEntity<Object> validationFailure(Exception exception, List<Violation> violations,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, "Input validation failed");
        if (!violations.isEmpty()) problem.setProperty("violations", List.copyOf(violations));
        // MVC supplies instance from the request URI; do not duplicate that lifecycle here.
        return handleExceptionInternal(exception, problem, headers, status, request);
    }

    private static Violation violation(ObjectError error) {
        return new Violation(error instanceof FieldError field ? field.getField() : "request", message(error));
    }

    private static String message(MessageSourceResolvable error) {
        // This fixture's constraint messages do not interpolate rejected values.
        return error.getDefaultMessage() == null ? "Invalid input" : error.getDefaultMessage();
    }
}
