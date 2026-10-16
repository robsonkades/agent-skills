# Report publishing

Java 17, no preview or external libraries. Review the current Bridge extraction before
release. Follow the caller contract and deployed wiring, identify any necessary correction,
and support findings with a focused check. Preserve the existing format/backend separation;
do not add classes merely to match a pattern diagram. Code changes are not required for a
review; distinguish a proposed correction from executed behavior.

The report team changes CSV/JSON content; the storage team maintains directory and memory
providers. A previous product hierarchy duplicated rendering in each backend. This extraction
keeps Report as input to one publisher, rather than adding a Publisher subclass for each format.

Compile using javac --release 17 -d classes src/*.java test/*.java.
Run java -cp classes SequentialTest. Choose the installed JDK without installing dependencies.
The deployment properties file is copied to config.properties for each reviewed instance.
