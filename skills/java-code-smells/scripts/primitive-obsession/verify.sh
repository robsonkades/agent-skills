#!/bin/sh
# Proves the confusion test in the Primitive Obsession budget: the untyped model executes
# the transposition, the typed model refuses to compile it.
# Requires a POSIX shell (Git Bash or WSL on Windows) and a JDK 21+ on PATH.
set -e
cd "$(dirname "$0")"
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

echo "--- Before.java: compiles, runs, transposes silently"
javac --release 21 -Xlint:all -d "$out" Before.java
java -cp "$out" Before

echo
echo "--- After.java: compiles, runs, rejects the currency mismatch"
javac --release 21 -Xlint:all -d "$out" After.java
java -cp "$out" After

echo
echo "--- AfterTransposed.java: MUST fail to compile"
if javac --release 21 -Xlint:all -XDrawDiagnostics -d "$out" AfterTransposed.java 2>"$out/err"; then
    echo "FAIL: the transposition compiled; the wrappers are not distinguishing anything"
    exit 1
fi
grep -q "compiler.err.cant.apply.symbol" "$out/err" || {
    echo "FAIL: compilation failed for the wrong reason:"
    cat "$out/err"
    exit 1
}
grep -q "CustomerId" "$out/err" && grep -q "AccountId" "$out/err" || {
    echo "FAIL: type-mismatch diagnostic did not name both domain types:"
    cat "$out/err"
    exit 1
}
echo "OK: $(head -1 "$out/err")"
