package example.hexagonal.application;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import example.hexagonal.adapter.JdbcOrders;
import example.hexagonal.domain.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.*;

class ArchitectureTest {
    private static final ArchRule CORE_IS_PLAIN_JAVA = noClasses()
            .that().resideInAnyPackage("example.hexagonal.domain..", "example.hexagonal.application..")
            .should().dependOnClassesThat().resideOutsideOfPackages(
                    "java..", "example.hexagonal.domain..", "example.hexagonal.application..");

    @Test
    void productionCoreHasNoExternalMechanismsAndDomainDoesNotDependOnApplication() {
        JavaClasses production = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("example.hexagonal");
        assertTrue(production.size() >= 7, "The guard must import production classes");
        assertTrue(production.contain(Order.class), "Domain package must be selected");
        assertTrue(production.contain(CreateOrder.class), "Application package must be selected");
        assertTrue(production.contain(JdbcOrders.class), "Adapter package must be selected");
        assertFalse(production.contain(ForbiddenDependency.class), "Test fixtures must be excluded");
        CORE_IS_PLAIN_JAVA.check(production);
        noClasses().that().resideInAPackage("example.hexagonal.domain..")
                .should().dependOnClassesThat().resideInAPackage("example.hexagonal.application..")
                .check(production);
    }

    @Test
    void theSameCoreRuleDetectsAKnownForbiddenType() {
        JavaClasses hostile = new ClassFileImporter().importClasses(ForbiddenDependency.class);
        AssertionError failure = assertThrows(AssertionError.class, () -> CORE_IS_PLAIN_JAVA.check(hostile));
        assertTrue(failure.getMessage().contains("org.springframework.http.ResponseEntity"));
    }

    private static final class ForbiddenDependency {
        private ResponseEntity<String> leakedHttpType;
    }
}
