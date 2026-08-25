# Naming heuristics and false positives

## Heuristics

- **The caller's sentence test.** Read the call site aloud as a sentence:
  `gateway.settle(request)` parses; `gateway.doProcess(data, true)` does not. The name is
  chosen for the hundreds of call sites, not the one declaration.
- **Domain vocabulary is load-bearing.** If the business says "capture", "chargeback",
  "settlement window", the API says it too — a translation layer between the code's words
  and the domain's words is a permanent tax on every conversation about the system.
  Invented synonyms (`finalise` for what the domain calls capture) are worse than jargon.
- **Verbs for effects, nouns for values.** Methods that do something are verb phrases
  (`reserveStock`, `emitReceipt`). Accessors are the value's name — record style `amount()`
  — unless the surrounding API family uses `getAmount()`; match the family.
- **Booleans**: `is`/`has`/`can` + positive form. `isActive`, `hasRemainingRetries`,
  `canSettle`. Negated names force double negation at call sites
  (`if (!isNotExpired(...))`) and eventually a bug.
- **Collections are plural**, and the element type is in the name only when the type
  system does not already say it: `lineItems()`, not `lineItemList()`.
- **Symmetric pairs stay symmetric**: `open`/`close`, `acquire`/`release`,
  `serialise`/`deserialise`. An API with `add` but `deleteEntry` makes callers memorise
  instead of predict.
- **Same word, same meaning, everywhere.** If `find*` returns `Optional` and `get*`
  throws when absent, that convention must hold across the whole surface — one
  exception destroys the predictive value of both prefixes.
- **The grep test.** A name should be findable: one-letter names, overloaded meanings of
  `process`/`handle`/`manage`, and `Util`/`Helper`/`Manager` suffixes all say "I could
  not name the responsibility" — which usually means the responsibility is not one thing.

## False positives — names that look wrong but are right

- **Long names.** `remainingSettlementWindow()` beats `remWindow()` and `window()`.
  Length is a cost only when it adds no precision; a long name is a problem only when its
  length comes from stacked qualifiers that belong on the type
  (`customerAddressPostcodeString` → `postcode()` on `Address`).
- **Family symmetry over local perfection.** If the existing family is `getAmount()`,
  `getCurrency()`, a new `settledAt()` — locally the better style — breaks the reader's
  pattern. Consistency within a published API family beats improving one member; improve
  the family in a major version or not at all.
- **Domain jargon opaque to outsiders.** `applyHaircut`, `dunningLevel`, `nostroAccount`
  are correct if that is what the domain calls them. The API's audience is people working
  in that domain; do not translate down.
- **Established abbreviations.** `id`, `url`, `ttl`, `iban`, `vat` are words. Expanding
  them (`timeToLiveSeconds` where the family says `ttl`) adds length, not clarity.
- **A conventional short name in a tight scope.** Loop indices and lambda parameters
  (`line -> line.amount()`) do not need domain-qualified names; the scope is one line.

## Renaming a published name

A rename in a published API is a removal plus an addition — a breaking change (see
compatibility.md). The non-breaking route: add the well-named method, implement the old
as a delegating `@Deprecated(since, forRemoval = true)` wrapper naming the replacement,
remove at the next major version. Budget for the old name living for years; that price is
why names deserve review before first publication, not after.
