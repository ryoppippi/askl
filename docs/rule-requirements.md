# Rule requirements

This document maps the portable Agent Skills specification and the authoring
guidance published for Claude and Codex to `askl`'s rules. It was reviewed on
2026-06-19.

## Sources

- [Agent Skills specification](https://agentskills.io/specification)
- [Agent Skills authoring best practices](https://agentskills.io/skill-creation/best-practices)
- [Claude skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Codex Agent Skills guide](https://developers.openai.com/codex/skills)
- [OpenAI skill examples](https://github.com/openai/skills)

Portable specification requirements take precedence. Platform conventions
must remain separate rules or explicit presets when applying them universally
would reject a valid portable skill.

## Current coverage

| Requirement                                                               | Source                 | Current rule                    | Status                                       |
| ------------------------------------------------------------------------- | ---------------------- | ------------------------------- | -------------------------------------------- |
| Parse YAML frontmatter and validate required and optional portable fields | Agent Skills           | `valid-frontmatter`             | Covered                                      |
| Match `name` to the containing directory                                  | Agent Skills           | `name-matches-directory`        | Covered                                      |
| Keep skill names unique within a configured collection                    | Operational safeguard  | `no-duplicate-skill-name`       | Covered                                      |
| Require instructions after frontmatter                                    | Agent Skills           | `no-empty-skill-body`           | Covered                                      |
| Bound the initial skill index size                                        | Progressive disclosure | `skill-index-budget`            | Partially covered                            |
| Keep `SKILL.md` concise                                                   | Agent Skills, Claude   | `max-skill-lines`               | Covered with a stricter configurable default |
| Keep references one level below `SKILL.md`                                | Agent Skills, Claude   | `no-deep-references`            | Covered for Markdown targets                 |
| Use forward slashes in paths                                              | Claude                 | `no-windows-paths`              | Covered for Markdown targets                 |
| Write descriptions in the third person                                    | Claude                 | `description-third-person`      | Covered                                      |
| Reject non-portable frontmatter extensions                                | Agent Skills           | `no-unknown-frontmatter-fields` | Covered as opt-in                            |
| Require local references to resolve inside the skill                      | Agent Skills           | `no-broken-local-references`    | Covered                                      |
| Add navigation to long text references                                    | Progressive disclosure | `long-reference-has-toc`        | Covered                                      |

## Implemented additions

### `no-broken-local-references`

Priority: high. Recommended rule.

The rule must validate relative Markdown links, images, and link definitions in
`SKILL.md` and report targets that do not exist. It must:

- resolve paths from the skill directory;
- ignore fragments and external URLs;
- accept a fragment on an existing local file;
- accept a reference to an existing directory, not only files;
- reject paths that escape the skill directory by default, while allowing an
  opt-in `allowOutsideSkillDirectory` option for repositories that share
  reference files or link between skills;
- report the reference line and unresolved target;
- avoid interpreting examples inside fenced code blocks as links.

This closes the main structural gap in progressive disclosure: the current
rules limit reference depth and path separators but do not prove that the
target can be loaded.

### `long-reference-has-toc`

Priority: high. General progressive-disclosure warning.

Claude recommends a table of contents at the top of reference files longer
than 100 lines because it may preview only part of a referenced file. The rule
must:

- inspect local files directly referenced by `SKILL.md`;
- apply only to text or Markdown reference files over a configurable line
  threshold, defaulting to 100;
- accept a Markdown list of links to headings near the start of the file;
- report the reference file through the owning `SKILL.md` diagnostic;
- remain outside a portable-only preset.

### Host-specific skill-index budgets

Priority: high. Configuration and documentation change.

Different agent hosts can impose different initial skill-index limits. Codex
limits its initial list to 2% of the model context window, or 8,000 characters
when the context window is unknown. It shortens descriptions first and may then
omit skills. `askl` must:

- document 8,000 characters as one host-specific configuration for
  `skill-index-budget`, not as a dedicated preset;
- preserve an explicit `maxCharacters` override;
- avoid claiming that 8,000 characters is a portable Agent Skills limit;
- explain that character count is a conservative proxy because the 2% limit
  depends on the active model context window.

## Lower-confidence additions

These checks reflect useful guidance but require conservative heuristics to
avoid noisy diagnostics.

### `description-includes-trigger`

Both the portable specification and Claude require descriptions to explain
what the skill does and when to use it. Codex additionally recommends concise,
front-loaded scope, boundaries, and trigger words because descriptions may be
shortened.

An opt-in warning may detect descriptions with no activation phrase such as
`Use when`, `Use for`, or `Triggers on`. It must not be recommended until it
has been tested against the official OpenAI skill collection and representative
Claude skills. Semantic quality and keyword placement cannot be enforced
reliably from syntax alone.

### `no-unlinked-reference-files`

Claude recommends linking reference files directly from `SKILL.md`. An opt-in
rule may report files under `references/` that are reachable only through
another reference file. It must ignore intentionally unused examples, fixtures,
and generated content through configuration.

## Discovery requirements

These are implemented discovery requirements rather than lint rules:

- follow symlinked skill directories;
- deduplicate canonical file paths when configured roots overlap;
- prevent symlink cycles during recursive discovery;
- preserve repository-relative diagnostic paths;
- document that Claude Code natively discovers `.claude/skills` and Codex
  natively discovers `.agents/skills` from the current directory up to the
  repository root, while `askl` scans roots relative to its own working
  directory;
- keep `.agent/skills`, `agents/skills`, and `skills` as compatibility roots,
  not as claims about Claude Code- or Codex-native discovery.

## Out of scope for deterministic linting

The following guidance should remain documentation or evaluation criteria:

- whether a skill represents real domain expertise;
- whether instructions are appropriately prescriptive;
- whether a skill is focused on one coherent job;
- whether procedures, examples, feedback loops, and defaults are effective;
- whether a description selects the skill for the right prompts without false
  positives.

These properties require task-level evaluation rather than static syntax
checks.
