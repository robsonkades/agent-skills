# Reading a printed compilation

## AT&T versus Intel

| Aspect           | AT&T                                        | Intel — commonly requested with `PrintAssemblyOptions=intel` |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Operand order    | `src, dst`                                  | `dst, src`                                                   |
| Register prefix  | `%eax`, `%rsi`                              | `eax`, `rsi`                                                 |
| Immediate prefix | `$0x10`                                     | `0x10`                                                       |
| Memory operand   | `disp(base,index,scale)` — `(%rsi,%rax,4)`  | `[base+index*scale+disp]` — `[rsi+rax*4]`                    |
| Size suffix      | `b`/`w`/`l`/`q` when no register implies it | `BYTE PTR`, `DWORD PTR`                                      |
| Same instruction | `mov %esi,%eax`                             | `mov eax, esi`                                               |

```
AT&T                                Intel
cmp    %edx,%esi                    cmp    esi, edx
mov    %esi,%eax                    mov    eax, esi
vpaddd %ymm1,%ymm0,%ymm0            vpaddd ymm0, ymm0, ymm1
```

Generate comparable captures in one convention and record it. Backend/build defaults can
differ because OpenJDK supports a build-time default as well as runtime plugin options. JMH
requests Intel syntax when `intelSyntax=true`; otherwise it does not force that option.
Identify the form from `%`/`$`, brackets and operand order rather than assuming a default.

Addressing is `base + index*scale + displacement`, `scale` in {1,2,4,8} — usually the element
size, which is why `0x10(%rdx,%r8,4)` reads as `array[i]` for an `int[]` past the 16-byte
array header. Under `-XX:+UseCompactObjectHeaders` the same access is `0xc(%rdx,%r8,4)` and
the length load moves from `0xc(%rdx)` to `0x8(%rdx)` (both verified on 25.0.3): confirm
the flag before reading a displacement as "the header", and expect `long[]`/`double[]` data
to stay 8-byte aligned either way.

## Anatomy of one printed compilation (JDK 25 layout)

```
============================= C2-compiled nmethod ==============================
----------------------------------- Assembly -----------------------------------

Compiled method (c2) 69   23       4       JitLab::get (4 bytes)
 total in heap  [0x…,0x…] = 424
 main code      [0x…,0x…] = 144
 stub code      [0x…,0x…] = 24
 relocation     [0x…,0x…] = 24
 nul chk table  [0x…,0x…] = 16
 scopes pcs     [0x…,0x…] = 96
 scopes data    [0x…,0x…] = 48

[Constant Pool (empty)]

[MachCode]
[Entry Point]                      ; instance methods only — receiver klass check, jne ic_miss
[Verified Entry Point]
  # {method} {0x…} 'get' '([II)I' in 'JitLab'
  # parm0:    rdx:rdx   = '[I'
  # parm1:    r8        = int
  #           [sp+0x30]  (sp of caller)
  …stack bang, push %rbp, sub $imm,%rsp, nmethod entry barrier…
  …body…
  …trap and safepoint stubs, {runtime_call Stub::method_entry_barrier}…
[Exception Handler]
[Deopt Handler Code]
[/MachCode]
```

The header line is the same as `PrintCompilation`'s: timestamp, compile id, attributes
(`%` OSR, `!` has exception handlers, `n` native, `s` synchronized), tier, method, bytecode
size. The size table is worth a glance — `nul chk table` non-empty means implicit null
checks were emitted; `main code` is the number to compare when asking whether a change made
the method bigger. `[Code]` as a section name is the pre-JDK 13 format. The decoded body of
this method is in `pattern-catalogue.md`.

Things this shows that are easy to get wrong:

- **Argument registers.** `parm0`/`parm1` arrive in `rdx`/`r8` here — this is Windows. On
  Linux the same method receives `rsi`/`rdx`. HotSpot's Java-to-Java convention
  (`SharedRuntime::java_calling_convention`) draws on the platform's integer argument
  registers but is neither System V nor the Win64 ABI, and it differs between the two OSes.
  Read the `# parmN:` comments rather than memorising a mapping. System V — `rdi`, `rsi`,
  `rdx`, `rcx`, `r8`, `r9`; return in `rax`; FP in `xmm0`–`xmm7` — applies when the listing
  calls a C++ runtime routine or a JNI stub on Linux; Win64 (`rcx`, `rdx`, `r8`, `r9`) when it
  does so on Windows.
- **Address scope.** Instructions within one contiguous code range are normally decoded in
  address order, but the complete log interleaves compilations and stubs, and code-cache
  space can be reused. Duplicate addresses are therefore a capture-correlation hazard, not
  proof of fabrication. Anchor every excerpt to compile id and `[start,end)` range; follow a
  branch by its numeric target, which may land in a separately printed cold stub.
- **Bytecode mapping.** `;*iaload {reexecute=0 rethrow=0 return_oop=0}` followed by
  `; - JitLab::get@2 (line 5)` ties the next address range to bytecode index 2 of the
  method, and an inlined callee shows as a second `; - Caller::m@bci` line under the first.
  This is how to find the code for a source line without hsdis at all.
- **Reserved registers.** In this C2/x86-64 compressed-oop capture, `%r15` carries the
  `JavaThread` and `%r12` is usable as the zero compressed-oop base. Both are configuration-
  specific HotSpot decisions, not ISA or C-ABI rules; confirm them before interpreting an
  operand such as `mov %r12d,0x14(%rax)` as a zero store.

## Optimisation signals

| Signal                                                                             | Indicates                                                      | Example                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------- |
| Packed lane opcode over `ymm` in a loop                                            | 256-bit vector operation; ISA depends on opcode                | `vpaddd %ymm1,%ymm0,%ymm0` |
| Packed lane opcode over `xmm`                                                      | 128-bit vector operation; prefix alone is not decisive         | `paddd %xmm1,%xmm0`        |
| Packed lane opcode over `zmm`, often with mask registers                           | 512-bit EVEX operation; not proof the whole loop is vectorized | `vpaddd %zmm1,%zmm0,%zmm0` |
| Several accesses at fixed offsets before one loop branch                           | Loop unrolling — **not** vectorisation                         | see below                  |
| `mov $imm,%reg` then `ret`, with no matching logic                                 | Constant folding — the method became a constant                | `mov $0x4,%eax`            |
| `cmp`/`test` followed by `cmovCC` instead of `jCC`                                 | Branch replaced by a conditional move                          | `cmovl %edx,%eax`          |
| `cmp` + `jae` before a loop head, none inside                                      | Bounds check hoisted by predication / range check elimination  | —                          |
| Thread-relative load/test with `{poll}`                                            | Safepoint poll in this JDK/port                                | —                          |
| Stack/thread comparison with `{poll_return}`                                       | Return poll in this JDK/port                                   | —                          |
| No allocation sequence after confirming inlining and every path                    | Candidate eliminated allocation; corroborate with profile/IR   | —                          |
| `lock cmpxchg`                                                                     | A CAS: monitor fast path, inflated monitor, or `AtomicX`       | see `pattern-catalogue.md` |
| `call` inside a hot loop with a `{static_call}`/`{optimized virtual_call}` comment | A callee that did not inline                                   | —                          |

```
add    0x10(%rsi,%rdx,4),%ebx        ; iteration 1   — scalar, 8-way unrolled:
add    0x14(%rsi,%rdx,4),%ebx        ; iteration 2     this is what an int[] sum reduction
add    0x18(%rsi,%rdx,4),%ebx        ; iteration 3     compiled to on 25.0.3, not vpaddd
…
vpaddd (%rsi),%ymm0,%ymm0            ; a vectorised body looks like this instead
vpaddd 0x20(%rsi),%ymm0,%ymm0
```

`cmov` removes a control dependency but keeps a data dependency and may require both input
values. That can help an unpredictable cheap branch and hurt a predictable branch or a long
dependency chain. C2's choice depends on target, graph and heuristics such as
`ConditionalMoveLimit`; defaults and use of profile data are version-specific. The presence
of `cmov` proves only the emitted form. Use branch samples/counters and end-to-end timing to
judge it.

## Null checks: three cases, not two

```
Load of a field or array element
├── Is there a cmp/test of the pointer immediately before it?
│   └── yes → EXPLICIT check. The analysis did not eliminate it, or
│             ImplicitNullChecks is off, or the field offset is too large to
│             fall inside the protected page, or the use is one that needs a
│             branch anyway (monitorenter is verified to test explicitly).
└── no → does the load carry a "; implicit exception" comment?
    ├── yes → IMPLICIT check. The load runs, a null pointer faults on the
    │         unmapped zero page (SIGSEGV), and HotSpot's signal handler looks
    │         the faulting PC up in the nmethod's implicit-exception table
    │         ("nul chk table" in the size header) and redirects to the
    │         NPE-throwing stub. Default: ImplicitNullChecks=true (pd diagnostic).
    └── no  → ELIMINATED by analysis. C2 proved non-nullity — freshly allocated
              reference, or a dominating equivalent check.
```

```
; explicit
0x...080:   test   %rsi,%rsi
0x...083:   je     0x00007f2a3c1050c0
0x...085:   mov    0x10(%rsi),%eax

; implicit — no test/je, but the comment gives it away
0x...090:   mov    0x10(%rsi),%eax   ; implicit exception: dispatches to 0x00007f2a3c1050f0

; eliminated — no test/je and no comment at all
0x...0a0:   mov    0x10(%rax),%eax
```

Collapsing "no visible `cmp`" into "proved non-null" is the standard error. For references
coming from outside the method — parameters, fields of passed objects — the implicit path is
the common one. The comment is HotSpot's, printed from the nmethod's relocations, so it is
present in the abstract listing too.

A safepoint poll historically used a protected polling page and modern ports use
thread-local polling state; see `pattern-catalogue.md`. A managed implicit null check is one
intentional fault path, but not the only possible managed signal use: stack banging,
safepoints, unsafe/native access and collector mechanisms also require context. A SIGSEGV
inside compiled code is neither automatically benign nor automatically a VM defect; inspect
HotSpot's fatal-error classification, faulting PC and code-range annotations.

## From instruction to performance claim

Do not convert mnemonic counts into cycles. The same instruction changes cost with
microarchitecture, operands, dependency chain, cache/coherence state, branch history,
frequency and neighbouring instructions. A cold-path `lock cmpxchg` can be irrelevant while
a seemingly cheap load dominates through cache misses.

Use this evidence ladder:

1. Mark normal, uncommon and runtime paths in the control-flow graph.
2. Sample PCs to establish which range is hot and retain enough events for stable ranking.
3. Form one microarchitectural hypothesis—branch misses, cache misses, front-end pressure,
   serialization—and select supported counters for that CPU.
4. Check counter multiplexing, skid and virtualization restrictions; counters are evidence,
   not source-line truth.
5. Change one factor, rerun the production-shaped workload, and validate throughput, tails,
   CPU, allocation and failure behavior.

## Primary references

- [HotSpot disassembler implementation](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/compiler/disassembler.cpp)
- [HotSpot x86 assembler sources](https://github.com/openjdk/jdk/tree/master/src/hotspot/cpu/x86)
- [JEP 312: Thread-Local Handshakes](https://openjdk.org/jeps/312)
- [JMH perfasm implementation](https://github.com/openjdk/jmh/blob/master/jmh-core/src/main/java/org/openjdk/jmh/profile/AbstractPerfAsmProfiler.java)
