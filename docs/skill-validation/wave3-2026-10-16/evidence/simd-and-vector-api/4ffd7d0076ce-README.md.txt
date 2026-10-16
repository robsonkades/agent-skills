# Calibration candidate fixture

Target: JDK 25 with the incubating module `jdk.incubator.vector`. No preview features or third-party dependencies.

The scalar method is the deployed operation. The candidate uses FMA. The caller validates the selected contract from `contract.properties`. Both methods require equal-length, non-null arrays and finite inputs with magnitude at most two. Inputs must not be concurrently mutated.

`CaseMain` exercises supplied sample rows across lengths zero through twice the preferred lane count plus one. It prints observations only. This is a bounded functional diagnostic, not a performance benchmark, generated-code inspection, or proof over the entire input domain.

Compile into your isolated output directory:

```text
javac --add-modules jdk.incubator.vector -d <output-directory> src/CalibrationKernel.java src/CalibrationConsumer.java src/CaseMain.java
java --add-modules jdk.incubator.vector -cp <output-directory> CaseMain
```

Run from this fixture directory so the two data files resolve. Keep generated classes and logs outside the fixture when evaluating separate actors. Do not install or upgrade the toolchain. No service profiles, decoded assembly, or comparative timings are supplied.
