# Export request middleware

The export entrypoint returns a CompletionStage<String>. Its only caller drains the host task queue, then observes completion as shown in ExportApp.main. A successful export must return `report`, invoke the rendering terminal once and release its session exactly once after the terminal finishes using it. Failure must remain visible and release the owned session. This caller never cancels or completes the returned stage externally.

The deployment's execution.mode is an accepted configuration; preserve it. Both modes are supported. TaskQueue is a deterministic local adapter to inspect scheduling, not evidence of thread-pool behavior. There are no framework dependencies or build scripts. Target Java is 17, without preview.

Compile with `javac --release 17 -d classes src/ExportApp.java`, then run `java -cp classes ExportApp app.properties` from this directory. Inspect the actual factory, caller and stage before deciding whether a change is needed. Keep the existing public completion contract and avoid adding a second middleware framework.
