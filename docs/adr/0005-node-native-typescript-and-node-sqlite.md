# Node 24+ native TypeScript and node:sqlite: no server build step, no native addons

Server code runs directly with `node src/server.ts` using Node's built-in type stripping, and stores data with the built-in `node:sqlite`. EventSub uses the global `WebSocket`, Helix uses the global `fetch`, and tests use `node:test`. That means no transpile step for the server, no tsx, no native modules (such as better-sqlite3) that can fail to build on a judge's Windows machine, and fewer moving parts for Codex to get wrong. Only the browser clients are bundled (Vite).

## Consequences

- Server TypeScript must be **erasable syntax only**: no enums, no namespaces, no constructor parameter properties.
- Relative imports end in `.ts`.
- The tsconfig enables `erasableSyntaxOnly`, `verbatimModuleSyntax` and `allowImportingTsExtensions`.
- `node:sqlite` may print an experimental warning on some Node versions. It's harmless, and the README says so.
- The minimum Node version is 24.12.0, where native type stripping is stable. Pin the Node 24 LTS major in CI. Browser code is built separately with Vite.
