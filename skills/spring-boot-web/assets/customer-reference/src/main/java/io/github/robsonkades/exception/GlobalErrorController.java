package io.github.robsonkades.exception;

import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@Hidden
@RestController
public class GlobalErrorController implements ErrorController {

    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalErrorController.class);

    @RequestMapping("${server.error.path:${error.path:/error}}")
    public ResponseEntity<ProblemDetail> error(final HttpServletRequest request) {
        var errorStatus = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        var status = HttpStatusCode.valueOf(errorStatus instanceof Integer code && code >= 400 && code <= 599 ? code : 500);
        if (status.is5xxServerError() && request.getAttribute(RequestDispatcher.ERROR_EXCEPTION) instanceof Throwable exception) {
            LOGGER.error("Erro encaminhado pelo servlet.", exception);
        }
        var problem = StandardProblem.forStatus(status).create(status);
        var errorUri = request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI);
        problem.setInstance(URI.create(errorUri instanceof String uri ? uri : request.getRequestURI()));
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }
}
