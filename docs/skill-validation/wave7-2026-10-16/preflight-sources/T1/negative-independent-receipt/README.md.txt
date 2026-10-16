# Application repair task

Java SE25, Spring Framework7.0.9, JDBC and H2 2.4.240. This is a small imperative application without Boot/JPA, preview, network services or new dependencies. Dependencies are in lib with a frozen manifest. Use node check.mjs to compile all src/test sources and run work.Smoke; node check.mjs work.YourTest runs another main-based test. Each subprocess has a 30-second bound. Existing tests are small and not an exhaustive specification.

Read CONTRACT.md and REQUEST.md. Make the smallest complete correction if required, or preserve a correct implementation with evidence. Existing public application operations and collaborator contracts must remain compatible. Add useful regression checks in test. Preserve the frozen CONTRACT.md, REQUEST.md, toolchain.json, dependencies.json, check.mjs, lib/** and support/**. You may edit src/**, add tests and update RUNBOOK.md. Never change contracts or dependencies just to pass a test. Tests should call actual Spring beans and inspect persisted state outside completion. Do not introduce application code that branches on test identities or expected results.

The database is local and disposable. No real agent installation or configuration is involved. These tests do not establish a production database's crash behavior, distributed deduplication or JPA semantics.
