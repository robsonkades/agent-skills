# Retained status values
Target source/API release: Java 17; do not upgrade the project.
The selected codec is configured in config.properties and created by Codecs.selected.
Only that codec is deployed for this store. The other implementation is an inactive option.
The fixtures contain trusted local data written by the old Status definition. Do not delete or rewrite them.
compat/Status.java preserves the old definition for a rollback reader.
Retained values must remain readable; required old readers must read new values with the same domain meaning.
No format migration, cache wipe or reader rollout is authorized by this rename task.

Compile the current reader into an isolated output directory:
javac --release 17 -d out/current src/Status.java src/Codecs.java src/CaseApp.java
Run from this case directory:
java -cp out/current CaseApp
To write a new value into a new artifact (not a retained fixture):
java -cp out/current CaseApp write out/new-value.dat
Compile the rollback reader separately:
javac --release 17 -d out/old compat/Status.java src/Codecs.java src/CaseApp.java
Then read the new artifact:
java -cp out/old CaseApp read out/new-value.dat

Compilation with a newer javac --release 17 does not establish behavior on a Java 17 VM.
