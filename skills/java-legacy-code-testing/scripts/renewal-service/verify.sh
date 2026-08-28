#!/bin/sh
# Shows the difference a seam makes: Before cannot be constructed at all, After produces the
# same answer on every machine and every date.
# Requires a POSIX shell (Git Bash or WSL on Windows) and a JDK 21+ on PATH.
set -e
cd "$(dirname "$0")"
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

echo "--- Before.java: MUST fail before any assertion is reached"
javac --release 21 -Xlint:all -d "$out" Before.java
if java -cp "$out" Before >"$out/before.log" 2>&1; then
    echo "FAIL: RenewalCheck was constructible; the example no longer shows the obstacle"
    cat "$out/before.log"
    exit 1
fi
grep -q "cannot connect to policy-db" "$out/before.log" || {
    echo "FAIL: it failed for the wrong reason:"
    cat "$out/before.log"
    exit 1
}
echo "OK: $(grep -m1 'IllegalStateException' "$out/before.log")"

echo
echo "--- After.java: constructs, runs, deterministic"
javac --release 21 -Xlint:all -d "$out" After.java
java -cp "$out" After
