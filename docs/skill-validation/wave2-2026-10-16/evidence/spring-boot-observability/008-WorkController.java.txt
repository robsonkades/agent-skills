package example.observability;

import java.util.concurrent.CompletableFuture;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WorkController {
    private final AsyncWork work;

    public WorkController(AsyncWork work) {
        this.work = work;
    }

    @GetMapping("/work/{user}")
    CompletableFuture<ResponseEntity<String>> work(@PathVariable String user,
            @RequestParam(defaultValue = "false") boolean fail, HttpServletRequest request) {
        return work.fetch(request.getLocalPort(), user, fail)
                .handle((body, error) -> error == null ? ResponseEntity.ok(body)
                        : ResponseEntity.status(502).body("downstream unavailable"));
    }

    @GetMapping("/downstream/{user}")
    ResponseEntity<String> downstream(@PathVariable String user,
            @RequestParam(defaultValue = "false") boolean fail) {
        return fail ? ResponseEntity.status(503).body("unavailable") : ResponseEntity.ok("ok");
    }
}
