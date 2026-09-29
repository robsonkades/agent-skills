package example.harness;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(TicketController.class)
@Import({ApiErrors.class, ApiSecurity.class})
class MvcSliceTest {
    @Autowired
    MockMvc mvc;

    @MockitoBean
    TicketService tickets;

    @Test
    void realChainRejectsAnonymousAndInsufficientAuthorityBeforeTheService() throws Exception {
        mvc.perform(get("/tickets/missing")).andExpect(status().isUnauthorized());
        mvc.perform(post("/tickets").with(user("reader").roles("READER")).with(csrf())
                        .contentType("application/json").content("{\"id\":\"a\",\"note\":\"valid\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(tickets);
    }

    @Test
    void realChainKeepsCsrfAndAllowsAnAuthorizedRequest() throws Exception {
        mvc.perform(post("/tickets").with(user("writer").roles("WRITER"))
                        .contentType("application/json").content("{\"id\":\"a\",\"note\":\"valid\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(tickets);
        mvc.perform(post("/tickets").with(user("writer").roles("WRITER")).with(csrf())
                        .contentType("application/json").content("{\"id\":\"a\",\"note\":\"valid\"}"))
                .andExpect(status().isCreated());
        verify(tickets).create("a", "valid");
    }

    @Test
    void realAdviceHandlesBindingValidationAndTheServiceFailure() throws Exception {
        mvc.perform(post("/tickets").with(user("writer").roles("WRITER")).with(csrf())
                        .contentType("application/json").content("{\"id\":\"a\",\"note\":\"\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Invalid ticket"));
        verifyNoInteractions(tickets);
        given(tickets.read("missing")).willThrow(new TicketService.MissingTicket("missing"));
        mvc.perform(get("/tickets/missing").with(user("reader")))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("Ticket not found"));
    }

}
