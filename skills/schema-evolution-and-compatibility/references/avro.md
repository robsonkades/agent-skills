# Avro

Coordinates. Runtime `org.apache.avro:avro:1.12.2` (the 1.11 line is `1.11.5`); code generation
`org.apache.avro:avro-maven-plugin:1.12.2`. **Pin 1.12.2** — the resolution matrix below was run on
**1.12.0**, and the union-default table was re-run across **1.11.4, 1.11.5, 1.12.0, 1.12.1 and
1.12.2**, which is what settled the `defaultVal()` question.

The **Schema Resolution** section of the specification is unchanged between 1.11.1 and 1.12.0: the
union-resolution and type-promotion wording was compared sentence by sentence and matches, though
the sections were not diffed character by character. The real difference is in the union-default
wording, and in the Java parser (below).

## The resolution rules, verbatim

> - **Type promotion**: "int is promotable to long, float, or double; long is promotable to float or
>   double; float is promotable to double; string is promotable to bytes; bytes is promotable to
>   string"
> - "the ordering of fields may be different: fields are matched by name"
> - "if the writer's record contains a field with a name not present in the reader's record, the
>   writer's value for that field is ignored"
> - "if the reader's record schema has a field that contains a default value, and writer's schema
>   does not have a field with the same name, then the reader should use the default value from its
>   field"
> - "if the reader's record schema has a field with no default value, and writer's schema does not
>   have a field with the same name, an error is signalled"
> - "if the writer's symbol is not present in the reader's enum and the reader has a default value,
>   then that value is used, otherwise an error is signalled"

Aliases are permissive, not guaranteed: "An implementation may **optionally** use aliases to map a
writer's schema to the reader's… Aliases function by re-writing the writer's schema using aliases
from the reader's schema." The Java implementation does honour them (verified below).

## What the Java implementation actually does — verified on 1.12.0

`SchemaCompatibility.checkReaderWriterCompatibility(reader, writer)` plus a real
`GenericDatumWriter` → `GenericDatumReader` round trip.

| Change (reader vs writer)                             | `SchemaCompatibility` verdict                                    | Actual read                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Add field **with** default                            | `COMPATIBLE`                                                     | `{"id": 7, "nick": "anon"}`                                            |
| Add field **without** default                         | `INCOMPATIBLE READER_FIELD_MISSING_DEFAULT_VALUE` at `/fields/1` | `AvroTypeException: Found U, expecting U, missing required field nick` |
| Remove a field                                        | `COMPATIBLE`                                                     | `{"id": 7}` — the writer's value is ignored                            |
| Rename **with** `aliases:["id"]`                      | `COMPATIBLE`                                                     | `{"userId": 7}`                                                        |
| Rename **without** alias                              | `INCOMPATIBLE READER_FIELD_MISSING_DEFAULT_VALUE` at `/fields/0` | —                                                                      |
| `int` → `long` (reader `long`)                        | `COMPATIBLE`                                                     | `{"id": 7}`                                                            |
| `long` → `int` (reader `int`)                         | `INCOMPATIBLE TYPE_MISMATCH: reader INT / writer LONG`           | —                                                                      |
| `string` ↔ `bytes`, either direction                  | `COMPATIBLE`                                                     | —                                                                      |
| Writer enum has an extra symbol, reader has `default` | `COMPATIBLE`                                                     | `{"c": "RED"}` — fell back to the default                              |
| Writer enum has an extra symbol, no `default`         | `INCOMPATIBLE MISSING_ENUM_SYMBOLS: [BLUE]`                      | `AvroTypeException: No match for BLUE`                                 |
| Reader union is a **superset**                        | `COMPATIBLE`                                                     | —                                                                      |
| Reader union is a **subset**                          | `INCOMPATIBLE MISSING_UNION_BRANCH: reader union lacking LONG`   | —                                                                      |
| Writer non-union `string`, reader `[null,string]`     | `COMPATIBLE`                                                     | —                                                                      |

**A rename is an add plus a remove.** The checker reports it as "reader field has no default value"
— the same incompatibility as adding a required field. `aliases` on the _reader_ is the only thing
that turns it back into a rename, and it must be the reader's schema that carries them.

## Enums and unions

The enum `default` attribute: "A default value for this enumeration, used during resolution when the
reader encounters a symbol from the writer that isn't defined in the reader's schema (optional). The
value provided here must be a JSON string that's a member of the symbols array." Introduced in
**1.9.0**; earlier readers tolerate and ignore it. It fires only for an _unknown symbol_ — if the
field itself is absent from the writer, the enum default does nothing and the field's own default is
what applies.

```json
{ "type": "enum", "name": "Colour", "symbols": ["RED", "GREEN"], "default": "RED" }
```

Unions: "Unions may not contain more than one schema with the same type, except for the named types
record, fixed and enum" and "Unions may not immediately contain other unions." Resolution is the
superset rule — the reader's union must contain every branch the writer might have used, so adding a
branch is consumer-first and removing one is producer-first.

## The union-default divergence, and the accessor bug it left behind

Verified with a plain `new Schema.Parser()`, no options set, probing `["null","string"]` with
`"default":"x"` across five releases:

```text
avro 1.11.4  -> REJECTED: AvroTypeException: Invalid default for field v: "x" not a ["null","string"]
avro 1.11.5  -> REJECTED  (identical)
avro 1.12.0  -> ACCEPTED   defaultVal() = null    <-- the lie
avro 1.12.1  -> ACCEPTED   defaultVal() = null    <-- still
avro 1.12.2  -> ACCEPTED   defaultVal() = x       <-- FIXED
```

On 1.11.4 the mirror case is rejected too (`["string","null"]` with `"default": null`:
`AvroTypeException: Invalid default for field v: null not a ["string","null"]`), and on 1.12.0 both
are accepted — even with `setValidateDefaults(true)` — while `["null","string"]` with `"default": 42`
is still rejected, because it matches no branch at all.

The accessor bug is therefore **bounded to 1.12.0 and 1.12.1**. On those two releases only, a
converter, code generator, Connect transform or custom linter that reads
`Schema.Field.defaultVal()` for a non-first-branch union default sees `null` while
`GenericDatumReader` correctly resolves the value:

```text
1.12.0  ["null","string"] declared default "x"  -> defaultVal() = null, but read gives {"id": 1, "v": "x"}
1.12.2  ["null","string"] declared default "x"  -> defaultVal() = x,    read gives {"id": 1, "v": "x"}
```

Pin 1.12.2 and the divergence is gone; no upstream issue was found for it either way. The spec-change
story is untouched — 1.12.2 still accepts what 1.11.5 rejects — so `["null", "T"]` with
`"default": null` remains the only shape that is correct under both spec versions and every language
implementation.

## A default is a read-time reinterpretation of all prior data

Verified. The bytes on disk never change; the reader's default decides what the absent field means,
retroactively, for every record ever written without it:

```text
writer D0: {a: int}                          (record already on disk: a=5)
reader D1: {a: int, b: int = 1}  -> reads {"a": 5, "b": 1}
reader D2: {a: int, b: int = 2}  -> reads {"a": 5, "b": 2}   <-- same bytes
```

Both Avro's checker and the registry call the D1 → D2 change `COMPATIBLE`, and in the narrow sense it
is. Only a round-trip test that asserts on the _value_ (see `runbook-and-ci.md`) catches it.

## Parsing canonical form, fingerprints and framing

> "STRIP: Keep only attributes that are relevant to parsing data, which are: type, name, fields,
> symbols, items, values, size. Strip all others (e.g., doc and aliases)."

Verified: `SchemaNormalization.parsingFingerprint64` of a record with and without a `"doc"` attribute
returns the same value (`133121827622752327`). Two consequences: documentation-only edits are the
same schema for fingerprinting, and **a fingerprint match tells you nothing about whether alias-based
rename resolution will work**, because aliases are stripped too. What the Confluent registry does
instead — and why a `doc` edit still burns a version there — is in `registry-and-json.md`.

Avro's binary encoding carries no field names, tags or type markers, so the writer schema must
travel separately. Three mechanisms exist and only the first two are Avro's: the **object container
file** (schema in the header, self-describing), and **single object encoding** — "A two-byte marker,
`C3 01`… The 8-byte little-endian CRC-64-AVRO fingerprint of the object's schema. The Avro object
encoded using Avro's binary encoding." The third is Confluent's framing, which is different bytes
and mutually unintelligible with `C3 01`; feeding one to a consumer configured for the other yields a
garbage schema id and "Unknown magic byte".

## `SpecificRecord` versus `GenericRecord`

`avro-maven-plugin` generates a class per record with a `public static final Schema SCHEMA$` holding
the schema **as of build time**. That embedded schema is the reader schema, permanently, for that
build — not what is in the registry and not what is in git. From
`AbstractKafkaAvroDeserializer.getReaderSchema` in `confluentinc/schema-registry`:

```java
} else if (useSpecificAvroReader) {
  readerSchema = getSpecificReaderSchema(writerSchema);
  readerSchemaCache.put(writerSchemaId, readerSchema);
} else {
  readerSchema = writerSchema;     // <-- specific.avro.reader defaults to false
}
```

So the choice is: `specific.avro.reader=true` with generated `SpecificRecord`s and full resolution,
or an explicit reader schema, or a `GenericRecord` consumer that follows the writer exactly. The
third is a legitimate design for a generic sink or router — which is why it is the default — and a
bug everywhere else.

**Unverified**: whether `SpecificDatumReader` honours the enum `default` symbol. Enum-default
resolution was verified through `GenericDatumReader` only; AVRO-3313 reports it not working in some
configuration and that was not reproduced. Test the `SpecificRecord` path before relying on it.
