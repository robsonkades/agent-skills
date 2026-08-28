# Reading a printed compilation

## AT&T (the hsdis default) versus Intel

| Aspect           | AT&T — default                              | Intel — `PrintAssemblyOptions=intel`      |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| Operand order    | `src, dst`                                  | `dst, src`                                |
| Register prefix  | `%eax`, `%rsi`                              | `eax`, `rsi`                              |
| Immediate prefix | `$0x10`                                     | `0x10`                                    |
| Memory operand   | `disp(base,index,scale)` — `(%rsi,%rax,4)`  | `[base+index*scale+disp]` — `[rsi+rax*4]` |
| Size suffix      | `b`/`w`/`l`/`q` when no register implies it | `BYTE PTR`, `DWORD PTR`                   |
| Same instruction | `mov %esi,%eax`                             | `mov eax, esi`                            |

```
AT&T                                Intel
cmp    %edx,%esi                    cmp    esi, edx
mov    %esi,%eax                    mov    eax, esi
vpaddd %ymm1,%ymm0,%ymm0            vpaddd ymm0, ymm0, ymm1
```

Generate your own captures in one convention and keep it, so listings you compare against
each other agree. Convert third-party excerpts mentally with this table instead.

Addressing is `base + index*scale + displacement`, `scale` in {1,2,4,8} — usually the element
size, which is why `0x10(%rsi,%rax,4)` reads as `array[i]` for an `int[]` past the array
header.

## Anatomy

```
Compiled method (c2)  4181  312       4       java.lang.Math::max (11 bytes)
 #  {method} {0x00007f2a380a4d20} 'max' '(II)I' in 'java/lang/Math'
 #  parm0:    rsi:rsi   = int
 #  parm1:    rdx:rdx   = int

[Entry Point]
  # unverified entry: receiver type check — N/A for a static method

[Verified Entry Point]
  0x00007f2a3c105040:   mov    %eax,-0x16000(%rsp)   ; stack banging (overflow check)
  0x00007f2a3c105047:   push   %rbp
  0x00007f2a3c105048:   sub    $0x10,%rsp

[Code]
  0x00007f2a3c10504c:   cmp    %edx,%esi
  0x00007f2a3c10504e:   jl     0x00007f2a3c105058
  0x00007f2a3c105050:   mov    %esi,%eax
  0x00007f2a3c105052:   add    $0x10,%rsp
  0x00007f2a3c105056:   pop    %rbp
  0x00007f2a3c105057:   ret
```

Two things this shows that are easy to get wrong:

- **Argument registers.** `parm0`/`parm1` arrive in `rsi`/`rdx`, not `rdi`/`rsi`. The
  convention C2 uses between two compiled Java methods
  (`SharedRuntime::java_calling_convention`) is not System V AMD64. Read the `# parmN:`
  comments rather than memorising a mapping. System V — arguments in `rdi`, `rsi`, `rdx`,
  `rcx`, `r8`, `r9`; integer return in `rax`; FP arguments in `xmm0`–`xmm7` — is what applies
  when the assembly calls a C++ runtime routine or a JNI stub.
- **Address ordering.** hsdis decodes sequentially, so listed addresses are strictly
  increasing and never repeat. A forward `jl` targets an address that appears later in the
  listing. An excerpt where one address is reused, or where a forward jump targets something
  already printed above it with a higher address, is fabricated — that is not something hsdis
  can produce.

HotSpot reserves `r15` for the current-thread pointer in JIT-generated code. That is a
HotSpot implementation decision, not an ISA or C-ABI rule.

## Optimisation signals

| Signal                                                      | Indicates                                       | Example                    |
| ----------------------------------------------------------- | ----------------------------------------------- | -------------------------- |
| `ymm` registers, `v` prefix                                 | AVX2 vectorisation, 256-bit                     | `vpaddd %ymm1,%ymm0,%ymm0` |
| `xmm` registers, no `v` prefix                              | SSE2 vectorisation, 128-bit                     | `paddd %xmm1,%xmm0`        |
| `zmm` registers                                             | AVX-512, 512-bit                                | `vpaddd %zmm1,%zmm0,%zmm0` |
| Several accesses at fixed offsets before one loop branch    | Loop unrolling                                  | see below                  |
| `mov $imm,%reg` then `ret`, with no matching logic          | Constant folding — the method became a constant | `mov $0x4,%eax`            |
| `cmp`/`test` followed by `cmovCC` instead of `jCC`          | Branch replaced by a conditional move           | `cmovl %edx,%eax`          |
| Recurring `test %reg,offset(%rip)` at every loop and return | Safepoint poll — always present, not a defect   | —                          |

```
vpaddd (%rsi),%ymm0,%ymm0            ; iteration 1
vpaddd 0x20(%rsi),%ymm0,%ymm0        ; iteration 2 (unrolled)
vpaddd 0x40(%rsi),%ymm0,%ymm0        ; iteration 3
vpaddd 0x60(%rsi),%ymm0,%ymm0        ; iteration 4
add    $0x80,%rsi
cmp    %rdx,%rsi
jl     0x00007f2a3c105a10
```

`cmov` wins specifically where the branch would be unpredictable: it removes misprediction
risk at the cost of always computing both sides. Where a branch is almost always taken the
same way, prediction is nearly free and `cmov` is not an improvement — it is not a universal
optimisation.

## Null checks: three cases, not two

```
Load of a field or array element
├── Is there a cmp/test of the pointer immediately before it?
│   └── yes → EXPLICIT check. The analysis did not eliminate it, or
│             ImplicitNullChecks is off, or the field offset is too large to
│             fall inside the protected page.
└── no → does the load carry a "; implicit exception" comment?
    ├── yes → IMPLICIT check. The load runs, a null pointer faults on the
    │         unmapped zero page (SIGSEGV), and HotSpot's signal handler looks
    │         the faulting PC up in the nmethod's implicit-exception table and
    │         redirects to the NPE-throwing stub. Default: ImplicitNullChecks=true.
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
the common one.

The safepoint poll uses the same class of mechanism for a different purpose: the JVM
protects the polling page, and the next thread to execute the `test` takes a SIGSEGV that the
handler diverts into safepoint entry.

## Cost figures

Treat these as order of magnitude only; they vary by microarchitecture (Zen 4, Sapphire
Rapids, Apple Silicon, Graviton all differ) and by cache state.

- A polling-page `test` outside an active safepoint: a few cycles, cache-hot in steady state.
- A mispredicted branch: tens of cycles on a modern CPU.

For a real number on the real host, run `perf stat -e branch-misses,cycles` rather than
quoting a table.
