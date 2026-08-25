/**
 * `@jvm-expert/registry` — where skills come from.
 *
 * Three interchangeable drivers behind one interface, plus the federation that gives an
 * ordered list of them precedence semantics. Nothing here knows about agents or installation.
 */
export { DefaultRegistryFactory, type DefaultRegistryFactoryOptions } from './factory.ts';
export { RegistryFederation } from './federation.ts';
export { GitRegistry, cacheKey, splitRef, type GitRegistryOptions } from './git-registry.ts';
export { HttpRegistry, type HttpRegistryOptions } from './http-registry.ts';
export { INDEX_RELATIVE_PATH, LocalRegistry, type LocalRegistryOptions } from './local-registry.ts';
export { matches, score, toSummaries } from './search.ts';
