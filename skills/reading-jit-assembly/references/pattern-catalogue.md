# Pattern catalogue: what the runtime's own code looks like

Every sequence here is an observed recognition aid, decoded from Temurin 25.0.3 product C2
output on x86-64 Windows with the stated/default flags and normalized to AT&T syntax. It is
not a stable machine-code ABI. Register choice, offsets, instructions, barrier expansion,
locking protocol and comments can change with JDK, vendor, compiler, architecture, GC,
pointer mode and CPU features. Match several signals—section, control flow, relocation
comment and source configuration—rather than one opcode or offset.

In this configuration, C2 uses `%r15` for `JavaThread` and `%r12` as the zero compressed-oop
base, so thread fields and zero stores explain many operands. Confirm those roles from the
port/generated-code sources and capture header before applying them elsewhere.

## Recognition table

| Shape (AT&T)                                                                                                                    | Comment printed                                                               | Meaning                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `mov 0x8(%rdx),%r10d` · `cmp 0x8(%rax),%r10d` · `jne …`                                                                         | `{runtime_call Shared Runtime ic_miss_blob}`                                  | `[Entry Point]` receiver check; instance methods only               |
| `mov %eax,-0x8000(%rsp)` · `push %rbp` · `sub $imm,%rsp`                                                                        | —                                                                             | Stack bang and frame; the bang offset is platform-specific          |
| `cmpl $imm,0x20(%r15)` · `jne <stub>` (stub: `call …` · `jmp back`)                                                             | `{runtime_call Stub::method_entry_barrier}`                                   | nmethod entry-barrier form observed in this configuration           |
| `mov 0x30(%r15),%reg` · `test %eax,(%reg)`                                                                                      | `{poll}`                                                                      | Loop safepoint poll                                                 |
| `cmp 0x28(%r15),%rsp` · `ja <stub>` … `ret`                                                                                     | `{poll_return}` then `{runtime_call SafepointBlob}`                           | Return poll (stack-watermark form)                                  |
| `mov 0xc(%rdx),%r10d` · `cmp %r10d,%r8d` · `jae <trap>`                                                                         | `;*iaload`                                                                    | Bounds check: length at `0xc`, unsigned compare, trap on failure    |
| `mov $0xffffffe4,%edx` · `call …`                                                                                               | `{runtime_call UncommonTrapBlob}`                                             | Uncommon trap; the immediate encodes reason and action              |
| `mov 0x1c8(%r15),%rax` · `add $size,%r10` · `cmp 0x1d8(%r15),%r10` · `jae <slow>` · `mov %r10,0x1c8(%r15)`                      | slow path `{runtime_call C2 Runtime new_instance}`                            | TLAB bump allocation                                                |
| `prefetchw 0xc0(%r10)` · `movq $0x1,(%rax)` · `movl $narrowKlass,0x8(%rax)`                                                     | `{metadata('Klass')}`                                                         | Allocation prefetch, mark word, compressed klass pointer            |
| `shr $0x9,%reg` · `mov %r12b,(%base,%reg,1)`                                                                                    | —                                                                             | Serial/Parallel card mark: one zero byte per 512-byte card          |
| `cmpb $0x0,0x48(%r15)` · `jne <pre-barrier>`                                                                                    | —                                                                             | G1 SATB pre-barrier guard (marking active?)                         |
| `xor %rax,%r11` · `shr $0x16,%r11` · `je` · `shr $0x9` · `cmpb $0x2,(%card)` · `jne`                                            | —                                                                             | G1 post-barrier: cross-region test, then young-card test            |
| `lock addl $0x0,-0x40(%rsp)` · `cmpb $0x0,(%card)` · `movb $0x0,(%card)`                                                        | —                                                                             | G1 post-barrier slow path: StoreLoad fence, dirty the card, enqueue |
| `mov (%obj),%r10` · `test $0x2,%r10b` · `jne` · `lock cmpxchg %r10,(%obj)` · `mov %obj,(%r15,%rbx,1)` · `addl $0x8,0x6d8(%r15)` | `;*monitorenter`                                                              | Lightweight lock fast path (`LockingMode=2`)                        |
| `lock cmpxchg %rbx,0x3e(%r10)`                                                                                                  | `;*monitorenter`                                                              | Inflated path: CAS on `ObjectMonitor::owner`                        |
| `mov field,%r8` · `shr $imm,%r8` · `ja <stub>`                                                                                  | `{barrier format=0}`, stub `load_barrier_on_oop_field_preloaded_runtime_stub` | ZGC load barrier                                                    |
| `testl $mask,field` · `jne` · `shl $imm,%r11` · `or $colour,%r11` · `mov %r11,field`                                            | `{barrier format=4}` / `{barrier format=5}`                                   | ZGC store barrier and colouring                                     |
| `nopl 0x…(%rax,%rax,1)` after a call                                                                                            | `{post_call_nop}`                                                             | post-call metadata marker; executed NOP still has footprint         |

## Method entry

In the observed C2 listing, `[Entry Point]` is the unverified receiver/inline-cache entry for
an instance method, while the static example starts at `[Verified Entry Point]`. The exact
receiver check, metadata representation and section emission are implementation details;
compact headers in particular change klass decoding. Use section labels and relocation
comments rather than hard-coding `%rax` or offset `0x8`.

This capture's prologue contains a stack bang, frame setup and an entry-barrier check whose
cold stub calls `Stub::method_entry_barrier` and rejoins. JDK-8290025 changed nmethod
unloading/barrier policy in JDK 20, but exact coverage and encoding still depend on compiler
and collector. Under this tested ZGC configuration the disarm value relates to pointer
colour. Recognize the annotated slow path; do not generalize the literal instruction or
claim it executes on every call.

Verified listing (`static int get(int[] a, int i) { return a[i]; }`, C2, tier 4):

```
[Verified Entry Point]
  # {method} {0x…} 'get' '([II)I' in 'JitLab'
  # parm0:    rdx:rdx   = '[I'
  # parm1:    r8        = int
  #           [sp+0x30]  (sp of caller)
  mov    %eax,-0x8000(%rsp)          ; stack bang
  push   %rbp
  sub    $0x20,%rsp
  cmpl   $0x1,0x20(%r15)             ; nmethod entry barrier
  jne    <method_entry_barrier stub>
  mov    0xc(%rdx),%r10d             ; a.length
  cmp    %r10d,%r8d
  jae    <uncommon trap>             ; i >= length, unsigned: catches negatives too
  mov    0x10(%rdx,%r8,4),%eax       ;*iaload  — a[i], int[] data starts at 0x10
  add    $0x20,%rsp
  pop    %rbp
  cmp    0x28(%r15),%rsp             ;   {poll_return}
  ja     <SafepointBlob stub>
  ret
  …
  mov    $0xffffffe4,%edx            ; trap request: reason + action
  call   UncommonTrapBlob            ;   {runtime_call UncommonTrapBlob}
```

Note the argument registers: `parm0` in `rdx`, `parm1` in `r8`. That is Windows; on Linux the
same method receives `rsi`, `rdx`. HotSpot's Java calling convention follows the platform's
integer-argument register set but not its order, and it is not System V or Win64 — read the
`# parmN:` comments every time.

## Safepoint polls

Modern HotSpot supports thread-local polling associated with JEP 312. In this capture the
loop poll loads a thread-relative polling address and touches it, while the return poll uses
a stack/thread comparison and branches to a `SafepointBlob` stub. JEP 376 introduced stack
watermarks, but do not infer a single causal mapping from that JEP to every emitted return
sequence. Poll placement and encoding vary; the annotations and target stub identify the
operation more reliably than offsets.

`test %eax,offset(%rip)` is a historical global polling-page form often seen in older
x86-64 material. It is a version clue, not sufficient dating evidence by itself; ports and
configurations evolve independently. `safepoints` owns what a poll triggers.

## Bounds checks and uncommon traps

The check is one unsigned compare of index against length followed by `jae` to a trap; the
unsigned form rejects a negative index in the same instruction. Inside a counted loop, range
check elimination and loop predication (`UseLoopPredicate`, `RangeCheckElimination`, both
default `true`) move it out to a pre-loop, so the main loop has no `cmp/jae` per access —
and the check has not vanished, it has been hoisted. To confirm elimination, look for the
compare above the loop head, not for its absence inside.

A trap is `mov $imm,%edx ; call UncommonTrapBlob`. The immediate packs the deoptimisation
reason and action; `-Xlog:deoptimization=debug` or the JFR `jdk.Deoptimization` event names
them (`deoptimization` owns that). A hot method whose listing is mostly trap stubs is a
method C2 compiled on a narrow profile — not a code-size problem.

## Allocation: the TLAB fast path

C2 inlines the bump: load `tlab_top` from the thread, add the object size, compare against
`tlab_end`, jump to the runtime on overflow, store the new top. Then a `prefetchw` past the
new object (allocation prefetch), the mark word `movq $0x1,(%rax)` (unlocked, no hash), the
narrow klass `movl $imm,0x8(%rax)` annotated `{metadata('Klass')}`, and field stores or
zeroing. The slow path is `{runtime_call C2 Runtime new_instance}`.

For this inlined TLAB allocation, the increment corresponds to the aligned instance size.
Absence of this exact pattern does not alone prove scalar replacement: allocation can use a
different path, compiler or configuration, and cropped listings can omit cold code. After
confirming the source `new` was inlined and all paths are present, absence becomes supporting
evidence to corroborate with allocation profiling or compiler IR. On 25.0.3 a two-field
example was 24 bytes by default and 16 under
`-XX:+UseCompactObjectHeaders`, where the header becomes one 64-bit store
(`movabs $mark|klass,%r10 ; mov %r10,(%rax)`) and the first field moves to `0x8`.
`object-layout-and-footprint` owns the layout rules.

## Reference stores: card marks and G1 barriers

**Serial and Parallel, observed form**: after a reference store into an existing object,
`shr $0x9,%addr ; mov %r12b,(%card_base,%addr,1)` — one shift, one byte store of zero. The
card table base arrives by `movabs`.

**G1, observed form**: the store has pre- and post-barrier logic. The pre-barrier guards on
`cmpb $0x0,0x48(%r15)` (is
concurrent marking active?) and, if so, loads the old value and pushes it on the thread's
SATB buffer. The post-barrier XORs the store address with the new value and shifts by the
region size (`shr $0x16` on this heap — the shift is `log2(region size)`, so it varies with
heap size), skips same-region stores, then shifts by `0x9`, adds the card table base and
tests the card for `0x2` (young): only an old-region card proceeds to the slow path with a
`lock addl $0x0,-0x40(%rsp)` StoreLoad fence, a `cmpb $0x0`/`movb $0x0` dirtying, and an
enqueue on the dirty-card queue at `0x50(%r15)`. JDK 24 (JDK-8334060) moved this expansion
after register allocation ("late barrier expansion"), which is why the sequence sits in one
block rather than interleaved with the body. `g1-internals` owns what the queues feed.

An omitted post-write card mark can be valid when C2 proves the destination is newly
allocated and `ReduceInitialCardMarks` applies. Other elisions and collector policies exist;
confirm destination age/escape and GC before declaring a missing barrier. In this `alloc`
capture, `n.next = head` had no card mark while `head = n` did.

## Locks

With `LockingMode=2` (the tested JDK 25 value;
lightweight locking arrived in JDK 21, JDK-8291555, and became the default in JDK 23,
JDK-8319251) `monitorenter` is: load the mark word; `test $0x2` for the inflated bit; check
the per-thread lock stack for room (`cmp $imm,%ebx`) and for recursion
(`cmp -0x8(%r15,%rbx,1),%obj`); CAS the mark word from `…01` (unlocked) to `…00` (locked)
with `lock cmpxchg`; push the object on the lock stack and bump its top
(`addl $0x8,0x6d8(%r15)`). `monitorexit` mirrors it: pop, then CAS the mark back to `…01`.
The older stack-locking protocol wrote a displaced header into the frame. A different CAS
shape is therefore a locking-mode/version clue, but not enough to classify a capture without
checking flags and surrounding `monitorenter` mapping.

The inflated path is `lock cmpxchg %tid,0x3e(%r10)` — a CAS on `ObjectMonitor::owner`
addressed relative to the mark word — followed by a recursion-count increment on the
re-entrant case, and the slow path is `{runtime_call C2 Runtime complete_monitor_locking}`.
`UseObjectMonitorTable` was diagnostic and false on this build and can change lookup/code
shape. A `lock cmpxchg` alone is ambiguous: monitor protocols, atomics/VarHandles and other
runtime code all use CAS. Bytecode mapping, object address and slow-path target distinguish
them; `lock-inflation` owns why the inflated path is being taken.

## ZGC barriers

Generational ZGC (JEP 439; non-generational mode removed by JEP 490 in JDK 24) colours
pointers. In this capture, a load is `mov field,%r8 ; shr $imm,%r8 ;
ja <stub>` — the shift both strips the colour bits and sets the carry flag when the pointer
is not "load-good" — and the stub calls
`load_barrier_on_oop_field_preloaded_runtime_stub`. A store first tests the field's current
colour (`testl $mask,field`, `{barrier format=4}`), then colours the new value
(`shl $imm ; or $colour`, `{barrier format=0}` / `{barrier format=5}`) and stores 64 bits —
ZGC has no compressed oops. The immediates are patched in place when the colour epoch
changes, which is what the `{barrier format=N}` relocations exist for. The nmethod entry
barrier uses the same colour as its disarm value. `zgc-generational-internals` owns the
colour scheme.

## Vectorised and unrolled loops

`ymm`/`zmm` registers with `v`-prefixed mnemonics are SuperWord output; several accesses at
fixed offsets (`0x10`, `0x14`, `0x18`, …) before one back-edge are unrolling. The two are
not the same finding, and unrolled scalar code is not evidence that vectorisation "broke":
on 25.0.3 the plain `int[]` sum reduction compiled to an 8-way unrolled scalar
`add off(%rsi,%rdx,4),%ebx` with no `vpaddd`, both in the OSR and the normal compilation.
Whether a given loop shape is vectorised at all is `simd-and-vector-api`'s subject; the
listing only tells you whether it was.

## Version notes

| Release | Change visible in a listing                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| JDK 10  | JEP 312 added thread-local handshakes/polling support; emitted forms remain port-specific                    |
| JDK 13  | Abstract disassembler (JDK-8213084): hex listing with annotations when hsdis is absent; `[MachCode]` framing |
| JDK 16  | JEP 376 introduced stack watermarks; modern return-poll forms may include stack/thread comparisons           |
| JDK 18  | hsdis built by `configure --with-hsdis=…` (JDK-8275128); capstone and LLVM backends                          |
| JDK 20  | Sweeper removal (JDK-8290025) changed nmethod unloading and entry-barrier policy                             |
| JDK 21  | Generational ZGC (JEP 439) barrier shape; lightweight locking available (JDK-8291555); `{post_call_nop}`     |
| JDK 23  | `LockingMode=2` default (JDK-8319251): lock stack, no displaced header in the frame                          |
| JDK 24  | G1 late barrier expansion (JDK-8334060); non-generational ZGC removed (JEP 490)                              |
| JDK 25  | `UseCompactObjectHeaders` product (JEP 519), default `false`: 8-byte header, offsets shift by 4              |

## Primary references

- [HotSpot x86 C2 macro assembler](https://github.com/openjdk/jdk/blob/master/src/hotspot/cpu/x86/c2_MacroAssembler_x86.cpp)
- [HotSpot x86 shared runtime](https://github.com/openjdk/jdk/blob/master/src/hotspot/cpu/x86/sharedRuntime_x86_64.cpp)
- [JEP 312: Thread-Local Handshakes](https://openjdk.org/jeps/312)
- [JEP 376: ZGC Concurrent Thread-Stack Processing](https://openjdk.org/jeps/376)
- [JEP 439: Generational ZGC](https://openjdk.org/jeps/439)
- [JEP 490: ZGC: Remove the Non-Generational Mode](https://openjdk.org/jeps/490)
- [JEP 519: Compact Object Headers](https://openjdk.org/jeps/519)
- [JDK-8291555: lightweight locking](https://bugs.openjdk.org/browse/JDK-8291555)
- [JDK-8290025: remove the sweeper](https://bugs.openjdk.org/browse/JDK-8290025)
