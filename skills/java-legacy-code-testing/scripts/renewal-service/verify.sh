#!/bin/sh
# Shows the seam's reachability, retained construction, result/effect checks and negative controls.
# Requires a POSIX shell (Git Bash or WSL on Windows) and a JDK 21+ on PATH.
set -e
cd "$(dirname "$0")"
root=$(pwd -P)
out=$(mktemp -d "$root/.verify.XXXXXX")
cleanup() {
    # Only remove the generated directory inside this fixture's canonical directory.
    case "$out" in
        "$root"/.verify.*) rm -rf -- "$out" ;;
        *) echo "Refusing cleanup outside fixture: $out" >&2; return 1 ;;
    esac
}
trap cleanup EXIT

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
echo "--- After.java: retained construction failure and reachable injected path"
javac --release 21 -Xlint:all -d "$out" After.java
java -cp "$out" After

echo
echo "--- Wrong policy ID: MUST fail for the lookup, not compilation or setup"
mkdir "$out/wrong-id"
sed 's/rates\.rateFor(p\.id())/rates.rateFor("WRONG-ID")/' After.java >"$out/wrong-id/After.java"
javac --release 21 -Xlint:all -d "$out/wrong-id" "$out/wrong-id/After.java"
if java -cp "$out/wrong-id" After >"$out/wrong-id.log" 2>&1; then
    echo "FAIL: assertions did not detect the wrong policy ID"
    exit 1
fi
grep -q 'AssertionError: unexpected rate lookup: WRONG-ID' "$out/wrong-id.log" || {
    echo "FAIL: negative control failed for an unrelated reason:"
    cat "$out/wrong-id.log"
    exit 1
}
echo "OK: wrong policy ID detected"

echo
echo "--- Bypassed default constructor: MUST fail despite the injected-path tests"
mkdir "$out/bypassed-default"
sed 's/this(new RateGateway(), Clock.systemDefaultZone());/this(id -> 1.0, Clock.systemDefaultZone());/' After.java >"$out/bypassed-default/After.java"
javac --release 21 -Xlint:all -d "$out/bypassed-default" "$out/bypassed-default/After.java"
if java -cp "$out/bypassed-default" After >"$out/bypassed-default.log" 2>&1; then
    echo "FAIL: assertions did not detect the bypassed production construction"
    exit 1
fi
grep -q 'AssertionError: default constructor bypassed RateGateway' "$out/bypassed-default.log" || {
    echo "FAIL: constructor negative control failed for an unrelated reason:"
    cat "$out/bypassed-default.log"
    exit 1
}
echo "OK: bypassed default constructor detected"
