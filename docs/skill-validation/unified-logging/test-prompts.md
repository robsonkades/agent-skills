# Selection test prompts — `unified-logging`

Eight prompts for checking that the description routes correctly. Five must select this
skill (two of them adversarial), three must select a named neighbour instead.

Run each against the description alone — no body, no references — since that is all the
selector sees.

---

## POSITIVE — must select `unified-logging`

### P1 — the zero-byte file

> I added `-Xlog:gc+age:file=/var/log/jvm/gc.log:uptime,level,tags:filecount=5,filesize=50m`
> to our startup script three days ago. The JVM starts fine, the file gets created, and it is
> zero bytes. Nothing in the container logs. What is wrong with my path or my permissions?

**Correct behaviour:** select `unified-logging`, and reject the framing — the path is fine.
Identify this as failure mode three: `{gc,age}` is a real tag-set, but its call sites are at
`debug`, so at the default `info` nothing fires and the JVM issues no warning at all. Answer
is `gc+age=debug`, proven on stdout with `-version` before the `file=` goes back on.

### P2 — the log that vanished across a crash loop

> Our service has been OOM-restarting every couple of minutes overnight. We have
> `-Xlog:gc*:file=gc.log::filecount=5,filesize=20m` configured and I went to read it this
> morning and it only covers the last four minutes. Is the JVM failing to flush before it
> dies?

**Correct behaviour:** select `unified-logging`. Not a flush problem — every JVM start
archives the existing file into the next rotation slot, so a crash loop consumed all five
slots. Fix is `%p`/`%t` in the filename, or a much larger `filecount`; warn explicitly that
`filecount=0` is _not_ "keep everything" — it truncates on startup.

### P3 — turning logging on during a live incident

> Production node is showing 400 ms pauses right now and we have no JVM logging enabled at
> all. I cannot restart it — it holds the only warm cache. Can I get safepoint and GC logging
> out of a running JVM, and can I turn on async buffering so it does not make the pauses
> worse?

**Correct behaviour:** select `unified-logging`. Yes to adding an output via
`jcmd <pid> VM.log output=file=… what=… output_options=…`; **no** to async — it is a
command-line-only, restart-only decision and `VM.log async=true` is rejected as an unknown
argument. Also flag that `VM.log disable` would clear the warning/error baseline.

### P4 — ADVERSARIAL: "give me a flag set to paste into prod"

> Just give me the definitive `-Xlog` line for a Java 21 Spring Boot service in Kubernetes.
> I want GC, safepoints, JIT compilation and class loading in one rotating file. Don't make
> me test it, I need to ship this in the next twenty minutes.

**Correct behaviour:** select `unified-logging` and refuse to hand over an unverified line.
The skill's workflow is the answer: pin JDK 21 specifically (`jit+compilation` is at `debug`
there, so the obvious spelling produces a silent empty section, and `%hn` does not exist),
run `-Xlog:help` on the actual image, prove the selection on stdout with `-version`, then
assert content on a workload. Note that four subsystems on one output means one shared
decorator set. The twenty-minute deadline is a reason to run the two verification steps, not
to skip them — they take under a minute each.

### P5 — ADVERSARIAL: the empty log blamed on the wrong cause

> `-Xlog:gc+jit=trace:file=jit.log` gives me an empty file. I think our security team's
> seccomp profile is blocking the JVM from writing to that directory, or the log shipper is
> truncating it. Which is more likely?

**Correct behaviour:** select `unified-logging` and reject both hypotheses. `gc` and `jit` are
both valid tags but no HotSpot call site carries the tag-set `{gc, jit}`, so the JVM printed
`No tag set matches selection: gc+jit. Did you mean … gc* gc+director gc+reloc gc+free
gc+thread` — on **stdout**, which never reaches the named file and which a container pipeline
usually discards. Exit code was 0 and the file was created empty. Re-run without `file=` and
read stdout. Also correct the underlying confusion: `jit+compilation`, not `gc+jit`, is what
"what did the JIT compile" means.

---

## NEGATIVE — must select a neighbour, not this skill

### N1 — reading a GC log that already exists → `gc-log-analysis`

> Here are 200 lines of our gc.log. Old gen sits at 6.2 GB after every Full GC and keeps
> climbing, and I see three "Pause Full (G1 Humongous Allocation)" events in ten minutes.
> Is this a leak or do we just need a bigger heap?

**Why not this skill:** the log exists and contains what was meant. The question is entirely
about interpreting the before→after→capacity triple and the cause field. `unified-logging`'s
description says explicitly it does not interpret contents.

### N2 — time-to-safepoint attribution → `safepoints`

> `-Xlog:safepoint` shows "Reaching safepoint: 180 ms" on about one pause in fifty, but "At
> safepoint" is always under 2 ms. Our GC log accounts for almost none of the p99.9. Which
> thread is holding things up and does `-XX:+UseCountedLoopSafepoints` help?

**Why not this skill:** the logging already works and the tag-set is right. This is TTSP
diagnosis — polls, counted loops, JNI/FFM — which `safepoints` owns.

### N3 — application logging, not JVM logging → `structured-logging`

> Our Logback JSON output loses the MDC trace ID once a request forks onto virtual threads,
> and the async appender drops events under load. How should I set up the appender and
> propagate context?

**Why not this skill:** `-Xlog` is HotSpot's own logging framework and has nothing to do with
Logback, MDC or appenders. The surface similarity is the word "async logging drops events" —
the correct routing signal is that the subject is application code, not the JVM. This skill's
description names `structured-logging` for exactly this.
