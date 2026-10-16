# Rendering refactor

The project targets Java 25. TextRenderer.legacy records the existing consumer-visible contract. TextRenderer.render is the candidate loop refactor; the output and accepted inputs must remain compatible. Review only render and leave legacy and ConsumerContract unchanged. The task does not authorize changing the public rendering format or dependencies.

Compile/run from an isolated copy:

```powershell
javac --release 25 -d classes TextRenderer.java ConsumerContract.java
java -cp classes ConsumerContract
```
