package example.clean;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import example.clean.application.PlaceOrder;
import example.clean.domain.Purchase;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import javax.tools.ToolProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.junit.jupiter.api.Assertions.*;

class BoundaryTest {
    private static final ArchRule APPLICATION = classes()
            .that().resideInAPackage("example.clean.application..")
            .should().onlyDependOnClassesThat().resideInAnyPackage(
                    "java.lang..", "java.util..", "example.clean.application..", "example.clean.domain..")
            .allowEmptyShould(false);

    @TempDir
    Path temporary;

    @Test
    void productionRegionsArePresentAndRespectDependencies() {
        JavaClasses production = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("example.clean");
        assertTrue(production.contain(Purchase.class));
        assertTrue(production.contain(PlaceOrder.class));
        assertFalse(production.contain(BoundaryTest.class));
        classes().that().resideInAPackage("example.clean.domain..")
                .should().onlyDependOnClassesThat()
                .resideInAnyPackage("java.lang..", "java.util..", "example.clean.domain..")
                .allowEmptyShould(false).check(production);
        APPLICATION.check(production);
    }

    @Test
    void forbiddenFrameworkTypeInProductionSignatureIsDetected() throws Exception {
        var imported = compileViolation("LeakedJdbc", "org.springframework.jdbc.core.JdbcTemplate");
        var failure = assertThrows(AssertionError.class, () -> APPLICATION.check(imported));
        assertTrue(failure.getMessage().contains("org.springframework.jdbc.core.JdbcTemplate"));
        assertTrue(failure.getMessage().contains("LeakedJdbc"));
    }

    @Test
    void invertedDependencyOnOuterTypeIsDetected() throws Exception {
        var imported = compileViolation("LeakedView", "example.clean.outer.ReceiptViews.Display");
        var failure = assertThrows(AssertionError.class, () -> APPLICATION.check(imported));
        assertTrue(failure.getMessage().contains("ReceiptViews$Display"));
        assertTrue(failure.getMessage().contains("LeakedView"));
    }

    @Test
    void emptyApplicationSelectionCannotPass() {
        var domainOnly = new ClassFileImporter().importClasses(Purchase.class);
        assertThrows(AssertionError.class, () -> APPLICATION.check(domainOnly));
    }

    private JavaClasses compileViolation(String name, String forbiddenType) throws Exception {
        Path source = temporary.resolve("src/main/java/example/clean/application/" + name + ".java");
        Files.createDirectories(source.getParent());
        Files.writeString(source, "package example.clean.application; public class " + name
                + " { public " + forbiddenType + " leaked; }");
        Path output = temporary.resolve("target/classes");
        Files.createDirectories(output);
        var compiler = ToolProvider.getSystemJavaCompiler();
        assertNotNull(compiler, "Run with the Java 25 JDK, not a JRE");
        try (var files = compiler.getStandardFileManager(null, null, null)) {
            var units = files.getJavaFileObjects(source);
            boolean compiled = compiler.getTask(null, files, null,
                    List.of("--release", "25", "-classpath", System.getProperty("java.class.path"),
                            "-d", output.toString()), null, units).call();
            assertTrue(compiled, "The violating source must compile before checking its dependency");
        }
        return new ClassFileImporter().importPath(output);
    }
}
