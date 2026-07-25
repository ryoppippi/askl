# Repository instructions

## Tests

- Keep rule tests in source under `if (import.meta.vitest)` in the rule's `index.ts`.
- Use `fs-fixture` for all test filesystem setup, reads, writes, copies, symlinks, and cleanup.
- Keep tests simple and explicit. Prefer setup and assertions written directly in each test over shared helpers such as `readFixture`.
- Use `bun run format` (Oxfmt); indentation is tabs.

## Implementation

- Keep production code DRY. Extract shared parsing, traversal, path handling, and validation logic instead of duplicating it across rules.
