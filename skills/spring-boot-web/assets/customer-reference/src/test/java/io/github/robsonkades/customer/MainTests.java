package io.github.robsonkades.customer;

import org.junit.jupiter.api.DisplayName;
import jakarta.servlet.RequestDispatcher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class MainTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("Context loads")
    void contextLoads() {
    }

    @Test
    @DisplayName("OpenAPI documents complete problem details and optional extensions")
    void openApiDocumentsCompleteProblemDetailsAndOptionalExtensions() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.schemas.ProblemDetail.required",
                        hasItems("type", "title", "status", "detail", "instance")))
                .andExpect(jsonPath("$.components.schemas.ProblemDetail.properties.errors.items.required",
                        hasItems("field", "message")))
                .andExpect(jsonPath("$.components.schemas.ProblemDetail.additionalProperties").value(true))
                .andExpect(jsonPath("$.components.schemas.ProblemDetail.properties.properties").doesNotExist())
                .andExpect(jsonPath("$.paths['/customers'].post.responses['400']"
                        + ".content['application/problem+json'].schema['$ref']")
                        .value("#/components/schemas/ProblemDetail"))
                .andExpect(jsonPath("$.paths['/customers'].post.requestBody.description")
                        .value("Dados completos do cliente. CPF com ou sem pontuação; data no formato AAAA-MM-DD."))
                .andExpect(jsonPath("$.paths['/customers'].post.requestBody.content['application/json']"
                        + ".examples['Novo cliente'].value.name").value("Ana Silva"))
                .andExpect(jsonPath("$.paths['/customers/search'].post.requestBody.description")
                        .value("Critérios opcionais de busca, paginação e ordenação."))
                .andExpect(jsonPath("$.paths['/customers/search'].post.requestBody.content['application/json']"
                        + ".examples['Busca por perfil e localização']").exists())
                .andExpect(jsonPath("$.paths['/customers/{customerId}'].put.requestBody.description")
                        .value("Representação completa para substituir os dados do cliente."))
                .andExpect(jsonPath("$.paths['/customers/{customerId}'].put.requestBody.content['application/json']"
                        + ".examples['Cliente atualizado'].value.name").value("Ana Silva"))
                .andExpect(jsonPath("$.paths['/customers/{customerId}'].patch.requestBody.description")
                        .value("Objeto JSON com campos do cliente; address deve estar completo quando enviado."))
                .andExpect(jsonPath("$.paths['/customers/{customerId}'].patch.requestBody.content['application/merge-patch+json']"
                        + ".examples['Atualizar telefone'].value.phone").value("+5511888888888"));
    }

    @Test
    @DisplayName("Servlet error dispatch uses problem details even when html is requested")
    void servletErrorDispatchUsesProblemDetailsEvenWhenHtmlIsRequested() throws Exception {
        mockMvc.perform(get("/error").accept(MediaType.TEXT_HTML)
                        .requestAttr(RequestDispatcher.ERROR_STATUS_CODE, 404)
                        .requestAttr(RequestDispatcher.ERROR_REQUEST_URI, "/original-path")
                        .requestAttr(RequestDispatcher.ERROR_MESSAGE, "internal-secret"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("urn:problem:resource-not-found"))
                .andExpect(jsonPath("$.title").value("Recurso não encontrado"))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("O recurso solicitado não foi encontrado."))
                .andExpect(jsonPath("$.instance").value("/original-path"))
                .andExpect(jsonPath("$.timestamp").doesNotExist())
                .andExpect(content().string(not(containsString("internal-secret"))));
    }

    @Test
    @DisplayName("Default error without servlet attributes returns complete internal error")
    void defaultErrorWithoutServletAttributesReturnsCompleteInternalError() throws Exception {
        mockMvc.perform(get("/error"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("urn:problem:internal-server-error"))
                .andExpect(jsonPath("$.title").value("Erro interno do servidor"))
                .andExpect(jsonPath("$.status").value(500))
                .andExpect(jsonPath("$.detail").isNotEmpty())
                .andExpect(jsonPath("$.instance").value("/error"));
    }

}
