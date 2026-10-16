# Executable value-object example

Use this example to inspect strict factories and collection-safe equality. Its source files
are [CustomerDocument](../assets/java/CustomerDocument.java),
[InvoiceAmount](../assets/java/InvoiceAmount.java), and
[ValueObjectsCheck](../assets/java/ValueObjectsCheck.java). They use the same
`com.example.domain.order` package; copy classes into the target's matching source roots
only after adapting the contracts. There is no required base class or framework dependency.

The deliberately fictional document format is `DOC-` plus eight ASCII digits. This example
does not validate a CPF, CNPJ or any official document, nor establish that a document exists.
The factory preserves leading zeroes and rejects extra punctuation, whitespace, wrong case
and Unicode lookalikes. Its `toString` avoids including the identifier value.

The illustrative invoice contract accepts USD/EUR, nonnegative amounts up to
`999999999.99`, and exact settlement at scale two. Input accepts one to nine integer digits
and one to four optional fractional digits; extra trailing zeroes within that bound are
equivalent. The input grammar bounds parsing cost. `10.001` is rejected rather than rounded.
The currency allowlist and scale are example business policy, not universal money rules or
defaults derived from ISO metadata. Calculation and FX operations would need separate
contracts. `add` rejects a currency mismatch and any result exceeding the same limit.

Both types use private construction, `of`, final fields/parameters/classes and explicit
equality/hashCode. Only immutable objects escape accessors. Exceptions use the JDK to keep
the fixture standalone; adapt them to the target's existing domain error convention.
The fixture targets Java 17 language/API compatibility without prescribing a JDK upgrade.

## Run the fixture

Requires a JDK with `javac --release 17` support and a Java runtime supporting the emitted
classes. It needs no network, framework, test library or agent configuration. Run from
the repository root; compilation writes only to a new temporary directory. The checks
throw `AssertionError` on failure and print their executed count on success; `-ea` is not
required.

PowerShell:

```powershell
$voSource = Join-Path (Get-Location) 'skills/java-ddd-value-objects/assets/java'
$voOutput = Join-Path ([IO.Path]::GetTempPath()) ('ddd-vo-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $voOutput | Out-Null
javac --release 17 -encoding UTF-8 -d $voOutput "$voSource/CustomerDocument.java" "$voSource/InvoiceAmount.java" "$voSource/ValueObjectsCheck.java"
if ($LASTEXITCODE -ne 0) { throw 'Value-object compilation failed' }
java -cp $voOutput com.example.domain.order.ValueObjectsCheck
if ($LASTEXITCODE -ne 0) { throw 'Value-object checks failed' }
```

POSIX shell:

```sh
vo_source=skills/java-ddd-value-objects/assets/java
vo_output=$(mktemp -d)
javac --release 17 -encoding UTF-8 -d "$vo_output" "$vo_source/CustomerDocument.java" "$vo_source/InvoiceAmount.java" "$vo_source/ValueObjectsCheck.java" &&
  java -cp "$vo_output" com.example.domain.order.ValueObjectsCheck
```

The checks exercise independent instances, equality properties, hash lookup, strict input
rejection, leading zeroes, scale equivalence, currency mismatch, exact precision, limits,
and immutable arithmetic. They do not establish ORM/JSON mapping, official document
validation, collection-valued deep immutability, or agent behavior. Add target-project
tests for those contracts when implementing them; the teaching example is not a held-out
skill evaluation.
