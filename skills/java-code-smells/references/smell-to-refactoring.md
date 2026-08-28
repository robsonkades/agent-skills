# Smell → refactoring

A routing table from a recorded finding to the java-refactoring techniques that address
it, and — the part that matters — what decides between them when several apply. The
techniques are named here, never taught; their preconditions and mechanics live in
java-refactoring's catalogue files.

Two rules before using it. One structural cause usually surfaces as several smells, so
route the **cause** once rather than each symptom. And every row has an unwritten first
option: leave it alone. See the last section.

| Smell                            | First move                                                   | If that is not enough                                                                                  | What decides                                                                                                  |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Mysterious Name                  | Rename                                                       | Extract, then name the pieces                                                                          | If no single name fits, the thing has more than one responsibility                                            |
| Long Method                      | Extract Method along abstraction levels                      | Split Phase; Decompose Conditional; Replace Conditional with Polymorphism                              | Shared locals block extraction → Split Phase. Length comes from type dispatch → polymorphism or sealed switch |
| Long Parameter List              | Introduce Parameter Object                                   | Preserve Whole Object; Remove Flag Argument; Replace Parameter with Query                              | Do the parameters form a concept (object) or does the caller already hold one (whole object)?                 |
| Large Class / God Object         | Extract Class per field cluster                              | Move Method toward the extracted data                                                                  | Cluster the fields by which methods use them; disjoint clusters are the seam                                  |
| Duplicate Code                   | Extract Method                                               | Extract Class; Pull Up Method; Form a shared type                                                      | Same reason to change → merge. Same shape, different reasons → leave it (java-dry-kiss-yagni)                 |
| Primitive Obsession              | Replace Primitive with Object (record + compact constructor) | Replace Type Code (enum or sealed)                                                                     | Does the primitive carry a rule, or a closed set of values?                                                   |
| Data Clumps                      | Introduce Parameter Object                                   | Extract Class if the group grows behaviour                                                             | Delete one member: if every use site breaks, it is one concept                                                |
| Temporary Field                  | Extract Method (demote to locals)                            | Introduce Parameter Object for the in-flight state                                                     | Does the state span one call flow (locals) or several (a carrier type)?                                       |
| Mutable Data                     | Encapsulate Variable                                         | Encapsulate Collection; Split Variable; Replace Derived Variable with Query; Change Reference to Value | Scope first, then immutability — one access point is the precondition for all of the others                   |
| Global Data                      | Encapsulate Variable                                         | Narrow the scope, or inject                                                                            | Same: get one access point before arguing about lifetime                                                      |
| Loops                            | Split Loop                                                   | Convert the halves that read better as pipelines                                                       | Early exit, index use, source mutation or a measured hot path → keep the loop                                 |
| Boolean blindness                | Replace Type Code with an enum                               | Remove Flag Argument at the call sites                                                                 | Is the boolean a property (keep) or a behaviour switch (split)?                                               |
| Dead Code                        | Delete                                                       | —                                                                                                      | There is no other technique; version control is the archive                                                   |
| Comments as deodorant            | Extract Method named after the comment                       | Rename until the comment is redundant                                                                  | Keep every why-comment; only what-comments are the smell                                                      |
| Speculative Generality           | Inline Class; Collapse Hierarchy                             | Delete unused parameters and hooks                                                                     | Is the seam load-bearing for tests or module boundaries? Then it stays                                        |
| Lazy Element                     | Inline Function / Inline Class                               | Collapse Hierarchy                                                                                     | A thin wrapper carrying a rule is a fix, not a smell                                                          |
| Feature Envy                     | Move Function                                                | Extract Function first, then move the envious part                                                     | Move only if the target should own it — a domain type gaining a rendering method is the worse trade           |
| Data Class                       | Move Function into it                                        | Encapsulate Collection; Replace Derived Variable with Query                                            | A DTO or event payload is data by design; only a domain class is the smell                                    |
| Inappropriate Intimacy           | Move Function / Move Field                                   | Extract Class for the shared part; Hide Delegate                                                       | Which side has the data the behaviour reads?                                                                  |
| Message Chains                   | Hide Delegate                                                | Move Function to where the chain ends                                                                  | Hiding each hop grows Middle Man; moving the behaviour does not                                               |
| Middle Man                       | Remove Middle Man                                            | Inline Function; Replace Superclass with Delegate                                                      | Count the methods that only forward; a mostly-forwarding class is the smell                                   |
| Divergent Change                 | Extract Class along the axes of change                       | Move Function                                                                                          | Group by _reason to change_, taken from the commit history, not by type                                       |
| Shotgun Surgery                  | Move Function / Move Field to gather the concept             | Combine Functions into Class; Inline Class                                                             | The inverse of Divergent Change: gather what scatters                                                         |
| Repeated Switches                | Replace Conditional with Polymorphism                        | Sealed interface + exhaustive switch                                                                   | Variants added often → polymorphism. Operations added often → sealed switch                                   |
| Refused Bequest                  | Push Down Method / Push Down Field                           | Replace Subclass with Delegate                                                                         | Is the hierarchy sound with the member moved, or wrong altogether?                                            |
| Alternative Classes, diff. iface | Change Function Declaration to align signatures              | Move Function; then Extract Superclass                                                                 | Only unify when the shared abstraction is real — otherwise the merge fits neither                             |
| Null-heavy API                   | Introduce Special Case                                       | `Optional` at the return boundary                                                                      | One shared default across many call sites → special case; otherwise `Optional`                                |
| Leaky abstraction                | Change Function Declaration                                  | Extract Class; Replace Query with Parameter                                                            | What is leaking — a type from a lower layer, or the caller's need to sequence calls?                          |

## Sequences that recur

Most findings need two or three techniques in a fixed order, and doing them out of order
is what makes a refactoring stall halfway:

```text
Split Variable ─────────► Extract Method          (locals must be effectively final first)
Slide Statements ───────► Extract Method          (inputs must sit together first)
Split Phase ────────────► Extract Method ×2       (when everything shares locals)
Encapsulate Variable ───► Replace Derived Variable with Query
                       └► Encapsulate Collection
Extract Method ─────────► Move Function           (extract the envious part before moving it)
Extract shared body ────► Remove Flag Argument    (or the split duplicates it)
Rename fields to agree ─► Pull Up Method          (identical in effect, not just in text)
Change Function Declaration ─► Extract Superclass (align the signatures before unifying)
```

## When the answer is no refactoring

"No refactoring required" is a valid output of a detection pass and should be reported as
one. Prefer it when:

- the code has not changed in a year and has no open defects — stable code is presumed
  innocent, whatever it looks like;
- the fix would trade a smell for indirection: a one-implementation interface, a parameter
  object that is a grab-bag, a special case that swallows a real failure;
- the abstraction is not yet earned — two occurrences is not a pattern, and merging on a
  guessed axis costs more than the duplication (java-dry-kiss-yagni);
- the finding's blast radius crosses a published, serialised or persistence boundary and
  nobody is paying for the migration it would need;
- the same change is already planned as part of upcoming feature work, where it will be
  free.

Record it as a note with the reason, not as a finding. A backlog of findings nobody acts
on trains the team to ignore the next pass.
