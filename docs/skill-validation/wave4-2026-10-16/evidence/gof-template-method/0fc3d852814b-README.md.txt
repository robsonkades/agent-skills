# Runner plugin API

Runner sequences input installation, an extension hook and publication. PluginExample is a supported plugin used by Demo. The API rules are in [docs/runner-contract.md](docs/runner-contract.md). SmokeTest covers ordinary calls.

Java 17 without preview; no external libraries. Compile src/*.java and test/*.java using javac --release 17 into a temporary output directory. Run SmokeTest or Demo using java -ea. The fixture has no files, network, database or background executor effects.
