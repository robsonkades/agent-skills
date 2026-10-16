# Shipping label review fixture

Synthetic Java 17 source example. There are no external dependencies, proxies or database calls. Objects are immutable after construction. Null collaborators are rejected; an empty zone is valid. Null Order passed to label fails with NullPointerException; exception message is not contracted. Keep those behaviors.

The API ownership decision is in api-contract.md. Review the implementation against that contract. Existing Java public visibility alone is not the compatibility policy.

Compile using an already available JDK with --release 17 into a temporary classes directory, then run ContractSmoke. Compilation on a newer JDK does not prove execution on a Java 17 VM.
