# Date import module

Java 17. Bootstrap creates one FormatterFactory per import thread and disposes it
after that import. Configuration is immutable for the factory lifetime. The only
supported locales are en-US and fr-FR; format patterns are validated at entry to
at most 128 characters, input dates to 256. The production cache admits at most 64
patterns and bypasses admission after the cap; valid inputs must still be parsed.
No caller uses formatter identity or retains mutable parsing state in the factory.

The requested locale is honored only when allowLocaleOverride is enabled.
Otherwise defaultLocale defines the text accepted for the entire import. Invalid
date text must be rejected; ISO dates returned to callers must be unchanged by
cache hits, miss/admission bypass or input order. Strict resolution is fixed.

The team proposes raising the cap to 4096 and sharing this factory across import
threads to avoid repeated construction. Review whether the proposal is justified,
and whether the current code can be retained under this deployment configuration.
Inspect the factory, bootstrap, configuration and sample inputs. No heap dump,
construction profile, wall-time comparison or memory-saving result is provided.
This is a design review, not permission for a runtime upgrade or global cache.
