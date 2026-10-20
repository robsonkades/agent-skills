# Validation and factory contracts

Read this when implementing or reviewing a validator, handler, factory or
validation lifecycle. The sole technical source is `ddd-example/domain`, inspected
at revision `8d964ce4106c2299164e28980ae7553e2afbdc92`. Source paths below are
relative to that module; Java package suffixes are relative to
`com.robsonkades.admin.catalogo.domain`. The code excerpts use that original
package and existing types; adapt only the target base package when reproducing
the pattern.

## Shared protocol

When reproducing the shared API, use the complete
[Error.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/Error.java),
[Validator.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/Validator.java)
and [ValidationHandler.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/ValidationHandler.java)
files. The following explanation and excerpt describe those same implementations.

`validation.Error` is `public record Error(String message) {}`. There is no error
code, field-path property, localization layer or message validation in this
record. Import it explicitly to distinguish it from `java.lang.Error`.

`validation.Validator` holds a `private final ValidationHandler handler`, receives
it in a protected constructor, exposes `protected ValidationHandler
validationHandler()` and declares `public abstract void validate()`. It performs
no null check on the supplied handler. Concrete validators hold a final reference
to their aggregate and delegate the handler to `super(aHandler)`.

The following is the complete `ValidationHandler` source contract:

```java
package com.robsonkades.admin.catalogo.domain.validation;

import java.util.List;

public interface ValidationHandler {
    ValidationHandler append(Error anError);

    ValidationHandler append(ValidationHandler anHandler);

    <T> T validate(Validation<T> aValidation);

    List<Error> getErrors();

    default boolean hasError() {
        return getErrors() != null && !getErrors().isEmpty();
    }

    default Error firstError() {
        if (getErrors() != null && !getErrors().isEmpty()) {
            return getErrors().get(0);
        } else {
            return null;
        }
    }

    interface Validation<T> {
        T validate();
    }
}
```

`ValidationHandler.Validation<T>` returns a value and declares no checked
exception. It is distinct from the aggregate's `void validate(handler)` and the
validator's `void validate()`. None of them is Jakarta Bean Validation.

## Handler behavior is part of the contract

When implementing either handler, inspect the complete
[Notification.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/handler/Notification.java)
and [ThrowsValidationHandler.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/handler/ThrowsValidationHandler.java)
files to preserve their different catch paths and return types. Their
`DomainException` dependency is provided by `java-ddd`.

| Operation                         | `Notification`                                                        | `ThrowsValidationHandler`                                                               |
| --------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Construction                      | Private list constructor; `create()` uses a fresh `ArrayList`         | Public implicit no-argument constructor                                                 |
| `append(Error)`                   | Adds the error, returns the same `Notification`                       | Throws `DomainException.with(error)` immediately                                        |
| `append(ValidationHandler)`       | Adds that handler's errors in order, returns `this`                   | Throws `DomainException.with(handler.getErrors())`, even for an empty list              |
| Successful `validate(callback)`   | Returns the callback's result                                         | Returns the callback's result                                                           |
| Callback throws `DomainException` | Adds all `getErrors()` entries and returns `null`                     | Caught as `Exception`; throws a new `DomainException` with one `Error(ex.getMessage())` |
| Callback throws another failure   | Catches `Throwable`, adds one `Error(t.getMessage())`, returns `null` | Catches `Exception` and wraps its message; a `java.lang.Error` escapes                  |
| `getErrors()`                     | Returns the live mutable list                                         | Returns `List.of()`                                                                     |

`Notification.create(Throwable)` always delegates through `new Error(t.getMessage())`;
it does not have the `DomainException` list-preserving branch of
`Notification.validate(...)`. `Notification.create(Error)` creates a fresh list
then appends that error. There is no deduplication, defensive list snapshot or
automatic reset. Reuse retains earlier errors, so start a new notification for an
independent operation. Do not cache one in a singleton service.

An invalid field evaluated with a throwing handler stops at its first append.
That does not mean `append(otherHandler)` retains only its first error: it passes
the whole list to `DomainException.with(List<Error>)`. Conversely, wrapping a
multi-error `DomainException` in `ThrowsValidationHandler.validate(...)` loses
that list and retains only the exception message as one error. In the reference,
`DomainException.with(List<Error>)` has an empty message; do not invent a combined
message when reproducing this behavior.

`Notification.validate` does not inspect or reject a returned object. A callback
can return a value while errors are already present, or return `null` normally.
A caught `DomainException` with an empty error list also returns `null` without
adding an error. Check the callback contract and notification together; do not
claim that `result != null` or `hasError() == false` alone proves success for every
possible callback. For exception hierarchy and list ownership see `java-ddd`.

These are existing semantics to preserve, including their limitations. A request
to change exception preservation, failure handling or list ownership needs a
separate contract decision and corresponding tests.

## Rule order and exact constraints

Each string field check first tests null, appends its message and returns; next
it tests `isBlank()`, appends its message and returns; then it computes
`value.trim().length()` for its length check. The return exits only that field
helper. Under `Notification`, later helpers continue in the order below. None of
these validators changes the stored string.

| Validator             | Checks in execution order                                                                                                                                           | Exact length error                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CategoryValidator`   | Name: non-null, nonblank, trimmed length 3–255                                                                                                                      | `'name' must be between 3 and 255 characters`                                                         |
| `GenreValidator`      | Name: non-null, nonblank, trimmed length 1–255                                                                                                                      | `'name' must be between 1 and 255 characters`                                                         |
| `CastMemberValidator` | Name: non-null, nonblank, trimmed length 3–255; then non-null type                                                                                                  | `'name' must be between 3 and 255 characters`                                                         |
| `VideoValidator`      | Title: non-null, nonblank, trimmed length at most 255; description: non-null, nonblank, trimmed length at most 4000; then non-null launchedAt; then non-null rating | `'title' must be between 1 and 255 characters`; `'description' must be between 1 and 4000 characters` |

Null errors are exactly `'name' should not be null`, `'type' should not be null`,
`'title' should not be null`, `'description' should not be null`,
`'launchedAt' should not be null` and `'rating' should not be null`, as applicable.
Blank strings produce `'name' should not be empty`, `'title' should not be empty`
or `'description' should not be empty`.

Do not replace Video's actual maximum-length-only comparison with a new minimum
comparison just because its message says "between 1 and". Preserve the operations
as written. Category's description, Video's duration, year range, publication
flags and referenced-ID existence are not checked by these validators. No gateway
lookups appear in them. Report a requested new rule as new business behavior,
rather than describing it as already enforced.

## A validator beside its aggregate

For the aggregate being changed, read its complete
[CategoryValidator.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/category/CategoryValidator.java),
[CastMemberValidator.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMemberValidator.java),
[GenreValidator.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/genre/GenreValidator.java)
or [VideoValidator.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoValidator.java).
The matching roots are shipped by `java-ddd-aggregates` under
`assets/reference/<family>/`; base types and exceptions are shipped by `java-ddd`.

The complete class below is the same `CategoryValidator` pattern. It requires
the existing `Category`, `Validator`, `ValidationHandler` and `Error`
types. The aggregate delegates through
`new CategoryValidator(this, handler).validate()` in its `validate(handler)`
method. Keep the source's visibility: Category and CastMember validator
constructors are public; Genre and Video validator constructors are protected.

```java
package com.robsonkades.admin.catalogo.domain.category;

import com.robsonkades.admin.catalogo.domain.validation.Error;
import com.robsonkades.admin.catalogo.domain.validation.ValidationHandler;
import com.robsonkades.admin.catalogo.domain.validation.Validator;

public class CategoryValidator extends Validator {
    public static final int NAME_MAX_LENGTH = 255;
    public static final int NAME_MIN_LENGTH = 3;
    private final Category category;

    public CategoryValidator(final Category aCategory, final ValidationHandler aHandler) {
        super(aHandler);
        this.category = aCategory;
    }

    @Override
    public void validate() {
        checkNameConstraints();
    }

    private void checkNameConstraints() {
        final var name = this.category.getName();
        if (name == null) {
            this.validationHandler().append(new Error("'name' should not be null"));
            return;
        }

        if (name.isBlank()) {
            this.validationHandler().append(new Error("'name' should not be empty"));
            return;
        }

        final int length = name.trim().length();
        if (length > NAME_MAX_LENGTH || length < NAME_MIN_LENGTH) {
            this.validationHandler().append(new Error("'name' must be between 3 and 255 characters"));
        }
    }
}
```

## Factories and self-validation

`newCategory`, `newGenre`, `newMember` and `newVideo` are static methods on their
roots. Each obtains its ID through the corresponding `ID.unique()` and obtains
one initial instant through `InstantUtils.now()` for creation/update timestamps.
Category and Genre also set `deletedAt` to that instant when initially inactive.
Use the existing overload, rather than introducing a separate factory class,
builder, gateway lookup or framework annotation.

The field-based `with(...)` methods receive identity and lifecycle values; the
object-based overloads copy an existing object. They call the owning constructor,
so Genre and CastMember still validate on restoration/copy. Category and Video
do not add field validation. See `java-ddd-aggregates` for collection copying and
`java-ddd-domain-events` for the distinction between Video's copy overload, which
carries events, and field-based restoration, which starts without them. Do not
emit an invented creation event from these factories.

This is a partial excerpt from inside `Genre`, using the existing
`Notification` and `NotificationException` imports:

```java
private void selfValidate() {
    final var notification = Notification.create();
    validate(notification);

    if (notification.hasError()) {
        throw new NotificationException("Failed to create a Aggregate Genre", notification);
    }
}
```

CastMember uses the same flow with message
`Failed to create a Aggregate CastMember`. Both updates call the same helper
after assigning their fields; the message still says "create" during update.
Preserve that observed message rather than silently rewriting the error contract.
Neither helper rolls state back. Category and Video have no such helper.

VO creation follows its own source contract: for example, `ImageMedia.with` and
`AudioVideoMedia.with` check required fields through constructor
`Objects.requireNonNull`, rather than aggregate validators. The short media
`with(...)` overload creates a new ID, whereas the longer one accepts an ID. A
method named `with` is therefore not universally a restoration operation; inspect
its signature and body. Use `java-ddd-value-objects` for those exact contracts.

## Focused domain tests

This complete test class can be compiled in the reference domain test source set
with its existing JUnit Jupiter setup and `UnitTest`. It uses actual objects,
constant inputs, the existing assertion style and `@DisplayName` on every test.
The two cases differ only in the handler: they expose ordered accumulation versus
first failure without mocks or interaction verification.

```java
package com.robsonkades.admin.catalogo.domain.video;

import com.robsonkades.admin.catalogo.domain.UnitTest;
import com.robsonkades.admin.catalogo.domain.exceptions.DomainException;
import com.robsonkades.admin.catalogo.domain.validation.Error;
import com.robsonkades.admin.catalogo.domain.validation.handler.Notification;
import com.robsonkades.admin.catalogo.domain.validation.handler.ThrowsValidationHandler;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

public class VideoValidationContractTest extends UnitTest {
    @Test
    @DisplayName("Collects the invalid video fields in validator order")
    public void givenInvalidFields_whenValidateWithNotification_shouldCollectErrors() {
        final var aVideo = Video.newVideo(
                null, null, null, 0.0, false, false, null,
                Set.of(), Set.of(), Set.of()
        );
        final var notification = Notification.create();

        aVideo.validate(notification);

        Assertions.assertEquals(List.of(
                new Error("'title' should not be null"),
                new Error("'description' should not be null"),
                new Error("'launchedAt' should not be null"),
                new Error("'rating' should not be null")
        ), notification.getErrors());
    }

    @Test
    @DisplayName("Stops video validation at the first invalid field with a throwing handler")
    public void givenInvalidFields_whenValidateWithThrowsHandler_shouldRejectFirstError() {
        final var aVideo = Video.newVideo(
                null, null, null, 0.0, false, false, null,
                Set.of(), Set.of(), Set.of()
        );

        final var actualException = Assertions.assertThrows(
                DomainException.class,
                () -> aVideo.validate(new ThrowsValidationHandler())
        );

        Assertions.assertEquals(
                List.of(new Error("'title' should not be null")),
                actualException.getErrors()
        );
    }
}
```

When the changed behavior involves construction or update instead, use the same
small-test style at that entry point. Category's invalid-name factory succeeds
until explicit validation; Genre's invalid-name factory throws
`NotificationException`. A rejected CastMember update can leave the new invalid
name assigned. These are distinct contracts; an assertion that merely "some
exception occurs" cannot distinguish them.

## Source map and limits

All paths in this table are under
`src/main/java/com/robsonkades/admin/catalogo/domain/` unless marked as test paths.
Read the current counterpart before changing its contract; the snapshot does not
authorize guessing a new rule when source or user requirements are missing.

| Contract                                              | Source                                                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared validation API and result type                 | `validation/Validator.java`, `validation/ValidationHandler.java`, `validation/Error.java`                                                                                                            |
| Accumulation, exception conversion and returned lists | `validation/handler/Notification.java`, `validation/handler/ThrowsValidationHandler.java`                                                                                                            |
| Field order, limits and messages                      | `category/CategoryValidator.java`, `genre/GenreValidator.java`, `castmember/CastMemberValidator.java`, `video/VideoValidator.java`                                                                   |
| Constructor/factory/update dispatch                   | `category/Category.java`, `genre/Genre.java`, `castmember/CastMember.java`, `video/Video.java`                                                                                                       |
| Exception messages and lists                          | `exceptions/DomainException.java`, `exceptions/NotificationException.java`, `exceptions/NotFoundException.java`                                                                                      |
| VO factories and null checks                          | `video/ImageMedia.java`, `video/AudioVideoMedia.java`, `video/Resource.java`                                                                                                                         |
| Existing domain test style and rejection expectations | Corresponding `CategoryTest`, `GenreTest`, `CastMemberTest`, `VideoTest`, `VideoValidatorTest`, `ImageMediaTest`, `AudioVideoMediaTest` under `src/test/java/com/robsonkades/admin/catalogo/domain/` |

The test examples above add the required `@DisplayName`; the inspected reference
tests do not contain it. No domain test uses Mockito, even though the shared build
convention declares that dependency. Its availability does not authorize mocks
in this domain test standard. Do not modify application or infrastructure to
demonstrate these domain contracts.
