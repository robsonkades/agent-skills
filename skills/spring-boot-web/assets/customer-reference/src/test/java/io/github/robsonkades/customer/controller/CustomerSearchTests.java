package io.github.robsonkades.customer.controller;

import org.junit.jupiter.api.DisplayName;
import io.github.robsonkades.customer.application.CustomerRepository;
import io.github.robsonkades.customer.application.CustomerService;
import io.github.robsonkades.customer.domain.Customer;
import io.github.robsonkades.customer.domain.CustomerAddress;
import io.github.robsonkades.customer.infrastructure.persistence.InMemoryCustomerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.UUID;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CustomerRestController.class)
@Import({CustomerService.class, InMemoryCustomerRepository.class})
class CustomerSearchTests {

    private static final UUID ANA_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID BRUNO_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID CARLA_ID = UUID.fromString("00000000-0000-0000-0000-000000000003");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CustomerRepository repository;

    @BeforeEach
    void storeCustomers() {
        repository.save(new Customer(ANA_ID, "Ana Silva", "ana@example.com", "+5511999999999",
                "52998224725", LocalDate.of(1990, 5, 20), address("São Paulo", "SP", "01001-000")));
        repository.save(new Customer(BRUNO_ID, "Bruno Souza", "bruno@example.com", "+5521988888888",
                "11144477735", LocalDate.of(1980, 1, 1), address("Rio de Janeiro", "RJ", "20000-000")));
        repository.save(new Customer(CARLA_ID, "Carla Lima", "carla@other.com", "+5511977777777",
                "12345678909", LocalDate.of(2000, 12, 31), address("Campinas", "SP", "13000-000")));
    }

    @ParameterizedTest
    @DisplayName("Searches by each text filter with default exact comparison")
    @CsvSource({
            "cpf,52998224725",
            "email,ANA@EXAMPLE.COM",
            "name,ANA SILVA",
            "phone,+5511999999999",
            "address.city,SÃO PAULO",
            "address.postalCode,01001-000"
    })
    void searchesByEachTextFilterWithDefaultExactComparison(String type, String value) throws Exception {
        search("""
                {"filters":[{"_discriminator":"%s","value":"  %s  "}]}
                """.formatted(type, value))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(ANA_ID.toString())))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    @DisplayName("Searches by state")
    void searchesByState() throws Exception {
        search("""
                {"filters":[{"_discriminator":"address.state","value":"sp"}]}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(ANA_ID.toString(), CARLA_ID.toString())));
    }

    @Test
    @DisplayName("Combines CPF and email with and")
    void combinesCpfAndEmailWithAnd() throws Exception {
        search("""
                {"filters":[
                  {"_discriminator":"cpf","value":"52998224725"},
                  {"_discriminator":"email","value":"ana@example.com"}
                ]}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(ANA_ID.toString())));

        search("""
                {"filters":[
                  {"_discriminator":"cpf","value":"52998224725"},
                  {"_discriminator":"email","value":"bruno@example.com"}
                ]}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @ParameterizedTest
    @DisplayName("Exact comparison does not match partial values")
    @ValueSource(strings = {
            "",
            """
            ,"operator":null
            """,
            """
            ,"operator":"exact"
            """
    })
    void exactComparisonDoesNotMatchPartialValues(String operator) throws Exception {
        search("""
                {"filters":[{"_discriminator":"email","value":"example.com"%s}]}
                """.formatted(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty());
    }

    @ParameterizedTest
    @DisplayName("Supports contains for text filters")
    @CsvSource({
            "cpf,529",
            "email,ANA@",
            "name,SILVA",
            "phone,999999999",
            "address.city,PAULO",
            "address.postalCode,01001"
    })
    void supportsContainsForTextFilters(String type, String value) throws Exception {
        search("""
                {"filters":[{"_discriminator":"%s","operator":"contains","value":"%s"}]}
                """.formatted(type, value))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(ANA_ID.toString())));
    }

    @Test
    @DisplayName("Combines text and date filters while preserving pagination and sorting")
    void combinesTextAndDateFiltersWhilePreservingPaginationAndSorting() throws Exception {
        search("""
                {
                  "filters": [
                    {"_discriminator":"name","operator":"contains","value":"A"},
                    {"_discriminator":"address.state","value":"SP"},
                    {"_discriminator":"birthDateRange","from":"1990-05-20","to":"2000-12-31"}
                  ],
                  "page":1,
                  "size":1,
                  "sort":[{"field":"birthDate","direction":"DESC"}]
                }
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(ANA_ID.toString())))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @ParameterizedTest
    @DisplayName("Accepts inclusive and open ended date ranges")
    @ValueSource(strings = {
            """
            "from":"1990-05-20","to":"1990-05-20"
            """,
            """
            "from":"1990-05-20"
            """,
            """
            "to":"1990-05-20"
            """
    })
    void acceptsInclusiveAndOpenEndedDateRanges(String bounds) throws Exception {
        search("""
                {"filters":[
                  {"_discriminator":"cpf","value":"52998224725"},
                  {"_discriminator":"birthDateRange",%s}
                ]}
                """.formatted(bounds))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(ANA_ID.toString())));
    }

    @ParameterizedTest
    @DisplayName("Accepts search without filters")
    @ValueSource(strings = {
            "{}",
            """
            {"filters":[]}
            """
    })
    void acceptsSearchWithoutFilters(String body) throws Exception {
        search(body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(
                        ANA_ID.toString(), BRUNO_ID.toString(), CARLA_ID.toString())))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @ParameterizedTest
    @DisplayName("Rejects pagination outside the allowed range")
    @ValueSource(strings = {
            """
            {"page":-1}
            """,
            """
            {"size":0}
            """,
            """
            {"size":101}
            """
    })
    void rejectsPaginationOutsideTheAllowedRange(String body) throws Exception {
        search(body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("urn:problem:validation-error"));
    }

    @ParameterizedTest
    @DisplayName("Rejects missing or invalid filter types and operators")
    @ValueSource(strings = {
            """
            {"value":"52998224725"}
            """,
            """
            {"_discriminator":null,"value":"52998224725"}
            """,
            """
            {"_discriminator":"unknown","value":"52998224725"}
            """,
            """
            {"operator":"exact","field":"cpf","value":"52998224725"}
            """,
            """
            {"_discriminator":"cpf","operator":"unknown","value":"52998224725"}
            """,
            """
            {"_discriminator":"birthDateRange","from":"invalid-date"}
            """
    })
    void rejectsMissingOrInvalidFilterTypesAndOperators(String filter) throws Exception {
        search("""
                {"filters":[%s]}
                """.formatted(filter))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("urn:problem:invalid-request-body"));
    }

    @ParameterizedTest
    @DisplayName("Rejects missing and blank text values")
    @ValueSource(strings = {
            """
            {"_discriminator":"cpf"}
            """,
            """
            {"_discriminator":"email","value":null}
            """,
            """
            {"_discriminator":"name","value":"  "}
            """
    })
    void rejectsMissingAndBlankTextValues(String filter) throws Exception {
        search("""
                {"filters":[%s]}
                """.formatted(filter))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("urn:problem:validation-error"))
                .andExpect(jsonPath("$.errors[0].field").value("filters[0].value"));
    }

    @Test
    @DisplayName("Rejects text values over the limit")
    void rejectsTextValuesOverTheLimit() throws Exception {
        search("""
                {"filters":[{"_discriminator":"email","value":"%s"}]}
                """.formatted("a".repeat(255)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("urn:problem:validation-error"));
    }

    @ParameterizedTest
    @DisplayName("Rejects invalid date ranges")
    @ValueSource(strings = {
            """
            {"_discriminator":"birthDateRange"}
            """,
            """
            {"_discriminator":"birthDateRange","from":"2000-01-01","to":"1990-01-01"}
            """
    })
    void rejectsInvalidDateRanges(String filter) throws Exception {
        search("""
                {"filters":[%s]}
                """.formatted(filter))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("urn:problem:invalid-customer"));
    }

    @Test
    @DisplayName("Query parameter filters continue to support partial search")
    void queryParameterFiltersContinueToSupportPartialSearch() throws Exception {
        var result = mockMvc.perform(get("/customers").param("cpf", "529").param("email", "EXAMPLE"))
                .andExpect(request().asyncStarted()).andReturn();
        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(ANA_ID.toString())));
    }

    private ResultActions search(String body) throws Exception {
        var result = mockMvc.perform(post("/customers/search").contentType(MediaType.APPLICATION_JSON)
                .content(body));
        var mvcResult = result.andReturn();
        return mvcResult.getRequest().isAsyncStarted() ? mockMvc.perform(asyncDispatch(mvcResult)) : result;
    }

    private static CustomerAddress address(String city, String state, String postalCode) {
        return new CustomerAddress("Rua das Flores", "123", null, "Centro", city, state, postalCode);
    }
}
