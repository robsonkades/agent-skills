# Unit-price contract

The selected parser comes from `project.properties`. Both parser providers are kept for
existing integrations; review the selected integration for this task.

Amounts are required decimal text, bounded to [-1000000, 1000000], with no nonzero value
beyond two fractional places. Equivalent spellings, removable trailing zeros and exponent
notation are accepted. Unit count must be positive. The unit price is the numeric amount
divided by units, rounded HALF_UP to scale 2 once for the quotient, independent of the
input spelling. Negative adjustments follow the same rule. This is a quote, not a promise
that identical rounded shares conserve a payment total.

Run `node verify.mjs`. No dependency installation is needed. It uses the available JDK at
`C:/Users/robso/.jdks/temurin-25.0.3/bin`; a different existing toolchain may be supplied by
process-local `REVIEW_JAVA_BIN`. Compilation targets Java 17. Report the actual runtime.
Commands and stdout/stderr are retained under the new temporary directory printed by the
runner. Preserve this public value/rounding contract and the selected parser configuration.
