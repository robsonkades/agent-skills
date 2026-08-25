/**
 * Test doubles for every infrastructure port, published as `@jvm-expert/core/testing`.
 *
 * Exported from the package rather than kept in a test folder so that an adapter or registry
 * published outside this repository can be tested against the same doubles the built-in ones
 * use — which is what makes the extension points genuinely usable by third parties.
 */
export { InMemoryFileSystem, type InMemoryFileSystemOptions } from './in-memory-file-system.ts';

export {
  FakeCommandRunner,
  FakeEnvironment,
  FakeHasher,
  FakeHttpClient,
  FakeRegistry,
  FixedClock,
  RecordingLogger,
  buildPackage,
  hasherOver,
  type BuildPackageOptions,
  type FakeEnvironmentOptions,
  type FakeRegistryOptions,
} from './doubles.ts';
