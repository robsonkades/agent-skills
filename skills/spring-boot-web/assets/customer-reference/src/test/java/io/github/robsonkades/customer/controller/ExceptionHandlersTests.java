package io.github.robsonkades.customer.controller;

import org.junit.jupiter.api.DisplayName;
import io.github.robsonkades.customer.application.CustomerRepository;
import io.github.robsonkades.customer.application.CustomerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.web.ErrorResponseException;

import java.net.URI;
import java.util.Optional;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CustomerRestController.class)
@Import(CustomerService.class)
class ExceptionHandlersTests {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CustomerRepository repository;

    @Test
    @DisplayName("Missing customer retains its specific not found response")
    void missingCustomerRetainsItsSpecificNotFoundResponse() throws Exception {
        var customerId = UUID.randomUUID();
        when(repository.findById(customerId)).thenReturn(Optional.empty());

        var result = mockMvc.perform(get("/customers/{customerId}", customerId))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(completeProblemDetail("urn:problem:customer-not-found", 404, "/customers/" + customerId))
                .andExpect(jsonPath("$.title").value("Cliente não encontrado"))
                .andExpect(jsonPath("$.detail").value("Cliente com ID '" + customerId + "' não foi encontrado."))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    @Test
    @DisplayName("Invalid customer retains its specific bad request response")
    void invalidCustomerRetainsItsSpecificBadRequestResponse() throws Exception {
        var customerId = UUID.randomUUID();
        var result = mockMvc.perform(patch("/customers/{customerId}", customerId)
                        .contentType("application/merge-patch+json")
                        .content("{}"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(completeProblemDetail("urn:problem:invalid-customer", 400, "/customers/" + customerId))
                .andExpect(jsonPath("$.title").value("Dados de cliente inválidos"))
                .andExpect(jsonPath("$.detail").value("Informe ao menos um campo para atualizar."))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    @Test
    @DisplayName("Malformed JSON returns bad request problem detail")
    void malformedJsonReturnsBadRequestProblemDetail() throws Exception {
        mockMvc.perform(post("/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(completeProblemDetail("urn:problem:invalid-request-body", 400, "/customers"))
                .andExpect(jsonPath("$.title").value("Corpo da requisição inválido"))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    @Test
    @DisplayName("Invalid request body returns bad request problem detail")
    void invalidRequestBodyReturnsBadRequestProblemDetail() throws Exception {
        mockMvc.perform(post("/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(completeProblemDetail("urn:problem:validation-error", 400, "/customers"))
                .andExpect(jsonPath("$.title").value("Dados da requisição inválidos"))
                .andExpect(jsonPath("$.detail").value("Um ou mais campos da requisição são inválidos."))
                .andExpect(jsonPath("$.errors[*].field",
                        hasItems("name", "email", "phone", "cpf", "birthDate", "address")))
                .andExpect(jsonPath("$.errors[?(@.field == 'name')].message", hasItem("O nome é obrigatório.")))
                .andExpect(jsonPath("$.errors[*].rejectedValue").doesNotExist());
    }

    @Test
    @DisplayName("Invalid UUID returns bad request problem detail")
    void invalidUuidReturnsBadRequestProblemDetail() throws Exception {
        mockMvc.perform(get("/customers/not-a-uuid"))
                .andExpect(completeProblemDetail("urn:problem:invalid-parameter", 400, "/customers/not-a-uuid"))
                .andExpect(jsonPath("$.title").value("Parâmetro inválido"))
                .andExpect(jsonPath("$.parameter").value("customerId"));
    }

    @Test
    @DisplayName("Invalid query parameter returns bad request problem detail")
    void invalidQueryParameterReturnsBadRequestProblemDetail() throws Exception {
        mockMvc.perform(get("/customers").param("size", "0"))
                .andExpect(completeProblemDetail("urn:problem:validation-error", 400, "/customers"))
                .andExpect(jsonPath("$.title").value("Dados da requisição inválidos"))
                .andExpect(jsonPath("$.errors[0].field").value("size"))
                .andExpect(jsonPath("$.errors[0].message").isNotEmpty())
                .andExpect(jsonPath("$.errors[*].rejectedValue").doesNotExist());
    }

    @Test
    @DisplayName("Unsupported method preserves status and allow header")
    void unsupportedMethodPreservesStatusAndAllowHeader() throws Exception {
        mockMvc.perform(delete("/customers"))
                .andExpect(completeProblemDetail("urn:problem:method-not-allowed", 405, "/customers"))
                .andExpect(jsonPath("$.supportedMethods", hasItems("GET", "POST")))
                .andExpect(header().string("Allow", containsString("GET")))
                .andExpect(header().string("Allow", containsString("POST")));
    }

    @Test
    @DisplayName("Unsupported content type preserves unsupported media type status")
    void unsupportedContentTypePreservesUnsupportedMediaTypeStatus() throws Exception {
        mockMvc.perform(post("/customers")
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("customer"))
                .andExpect(completeProblemDetail("urn:problem:unsupported-media-type", 415, "/customers"))
                .andExpect(header().string("Accept", containsString("application/json")))
                .andExpect(jsonPath("$.supportedMediaTypes", hasItem("application/json")));
    }

    @Test
    @DisplayName("Unexpected failure returns generic problem detail without internal message")
    void unexpectedFailureReturnsGenericProblemDetailWithoutInternalMessage() throws Exception {
        var customerId = UUID.randomUUID();
        when(repository.findById(customerId)).thenThrow(new IllegalStateException("Internal persistence failure"));

        var result = mockMvc.perform(get("/customers/{customerId}", customerId))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(completeProblemDetail("urn:problem:internal-server-error", 500, "/customers/" + customerId))
                .andExpect(jsonPath("$.title").value("Erro interno do servidor"))
                .andExpect(jsonPath("$.detail").value("Ocorreu um erro inesperado ao processar a requisição."))
                .andExpect(content().string(not(containsString("Internal persistence failure"))))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    @Test
    @DisplayName("Framework error without detail gets complete problem detail")
    void frameworkErrorWithoutDetailGetsCompleteProblemDetail() throws Exception {
        var customerId = UUID.randomUUID();
        when(repository.findById(customerId)).thenThrow(new ErrorResponseException(HttpStatus.SERVICE_UNAVAILABLE));

        var result = mockMvc.perform(get("/customers/{customerId}", customerId))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(completeProblemDetail("urn:problem:service-unavailable", 503, "/customers/" + customerId))
                .andExpect(jsonPath("$.detail").value("O serviço está temporariamente indisponível."));
    }

    @Test
    @DisplayName("Framework error preserves its custom fields and properties")
    void frameworkErrorPreservesItsCustomFieldsAndProperties() throws Exception {
        var customerId = UUID.randomUUID();
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Uma operação está em andamento.");
        problem.setType(URI.create("urn:problem:operation-in-progress"));
        problem.setTitle("Operação em andamento");
        problem.setInstance(URI.create("/operations/123"));
        problem.setProperty("operationId", "123");
        when(repository.findById(customerId)).thenThrow(new ErrorResponseException(HttpStatus.CONFLICT, problem, null));

        var result = mockMvc.perform(get("/customers/{customerId}", customerId))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(completeProblemDetail("urn:problem:operation-in-progress", 409, "/operations/123"))
                .andExpect(jsonPath("$.title").value("Operação em andamento"))
                .andExpect(jsonPath("$.detail").value("Uma operação está em andamento."))
                .andExpect(jsonPath("$.operationId").value("123"));
    }

    @Test
    @DisplayName("Nested validation errors include the field path")
    void nestedValidationErrorsIncludeTheFieldPath() throws Exception {
        mockMvc.perform(post("/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"address":{}}
                                """))
                .andExpect(completeProblemDetail("urn:problem:validation-error", 400, "/customers"))
                .andExpect(jsonPath("$.errors[*].field", hasItems("address.street", "address.city", "address.postalCode")));
    }

    @Test
    @DisplayName("Missing route returns standard problem detail")
    void missingRouteReturnsStandardProblemDetail() throws Exception {
        mockMvc.perform(get("/not-a-route"))
                .andExpect(completeProblemDetail("urn:problem:resource-not-found", 404, "/not-a-route"))
                .andExpect(jsonPath("$.title").value("Recurso não encontrado"));
    }

    @Test
    @DisplayName("Unacceptable response format returns standard problem detail")
    void unacceptableResponseFormatReturnsStandardProblemDetail() throws Exception {
        mockMvc.perform(get("/customers").accept(MediaType.APPLICATION_XML))
                .andExpect(completeProblemDetail("urn:problem:not-acceptable", 406, "/customers"))
                .andExpect(jsonPath("$.supportedMediaTypes", hasItem("application/json")));
    }

    @Test
    @DisplayName("Absent body returns standard problem detail")
    void absentBodyReturnsStandardProblemDetail() throws Exception {
        mockMvc.perform(post("/customers").contentType(MediaType.APPLICATION_JSON))
                .andExpect(completeProblemDetail("urn:problem:invalid-request-body", 400, "/customers"));
    }

    private static ResultMatcher completeProblemDetail(String type, int statusCode, String instance) {
        return result -> {
            status().is(statusCode).match(result);
            content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON).match(result);
            jsonPath("$.type").value(type).match(result);
            jsonPath("$.title").isNotEmpty().match(result);
            jsonPath("$.status").value(statusCode).match(result);
            jsonPath("$.detail").isNotEmpty().match(result);
            jsonPath("$.instance").value(instance).match(result);
            jsonPath("$.properties").doesNotExist().match(result);
        };
    }
}
