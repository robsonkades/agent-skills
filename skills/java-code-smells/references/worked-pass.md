# A worked smell pass

The subject: `InvoiceService`, 310 lines, the file with the second-highest commit count in
the repository over six months. The pass, the findings, and — as important — what was
deliberately not reported.

## The signals

- `git log --oneline -- InvoiceService.java` — 41 commits in six months, tickets spanning
  tax rules, PDF layout and dunning emails. Three unrelated reasons to change.
- Size scan: `issue(...)` is 74 lines; the class holds 9 fields.
- Duplication scan on a distinctive literal (`"yyyyMMdd"`): the same due-date formatting
  block appears here, in `ReminderService` and in `ExportService`.

## The code (condensed)

```java
public class InvoiceService {
    // fields cluster A: taxTable, roundingMode        — used only by issue()
    // fields cluster B: pdfRenderer, layoutTemplates  — used only by render()
    // fields cluster C: mailer, dunningSchedule       — used only by remind()

    public Invoice issue(String customerId, String currency, long netCents,
                         LocalDate periodStart, LocalDate periodEnd, boolean retail,
                         boolean export) {
        // 74 lines: validates currency string, picks tax rate (nested if on
        // retail/export), rounds, formats dates, persists
    }

    public byte[] render(Invoice invoice) { /* 40 lines of PDF assembly */ }

    public void remind(Invoice invoice) { /* 55 lines; reads invoice fields heavily */ }
}
```

## Findings, in severity order

**1. Divergent Change — the class.** Evidence: 41 commits, three unrelated ticket
families, three disjoint field clusters (A/B/C above). Blast radius: every invoice
feature merges through this file; two reverted merge conflicts in the log. Severity:
high — frequency and radius both. Fix: Extract Class per cluster (java-refactoring);
tax/issuing, rendering, dunning.

**2. Duplicate Code — due-date formatting.** Evidence: identical 6-line block in three
services; last quarter a format change shipped in two of the three (defect INV-482 —
the third was missed). The defect is the severity argument: these change together for
the same reason, so this is knowledge duplication, not incidental similarity
(java-dry-kiss-yagni draws that line). Fix: Extract Method onto the type that owns due
dates, then Move Method.

**3. Primitive Obsession + boolean blindness — `issue`'s signature.** Evidence:
`String currency` validated inside the method (and nowhere else that accepts one);
`retail`/`export` have three legal combinations out of four, guarded by a runtime check.
Severity: medium — the signature is package-internal, callers are few, but every new
caller can produce the illegal combination. Fix: Replace Type Code with a sealed
`CustomerKind` (`Retail`, `Export`, `Domestic`); currency becomes a validated type.
`periodStart`/`periodEnd` are a Data Clump for the same Parameter Object move.

**4. Long Method — `issue`, 74 lines.** Reported last, deliberately: it is a _symptom_ of
findings 1 and 3. Extracting sub-methods now would be re-arranged furniture in a room
that is being split. Note it, sequence it after the Extract Class.

## Not reported

- **`render` reads many `Invoice` accessors — looks like Feature Envy.** A renderer's
  job is reading another object's data; moving PDF assembly into `Invoice` would couple
  the domain to a PDF library. False positive by the catalogue's own exclusion.
- **`taxTable` has one implementation behind an interface — looks like Speculative
  Generality.** The interface is the seam the tax tests fake; it is load-bearing.
  Excluded.

## Output shape

Each finding shipped as: smell → location → evidence (checkable) → severity argument
(frequency × radius, with the log data) → named java-refactoring technique → sequencing
note. No code was changed during the pass; the fixes were scheduled as separate
refactoring work under java-refactoring's safety workflow.

## Verification of the pass itself

A finding is well-formed when a reviewer can (a) reproduce the evidence from the
repository alone and (b) say what would falsify it — e.g. finding 2 dies if the three
blocks turn out to serve different formats. Findings that cannot be falsified are
opinions, and were cut.
