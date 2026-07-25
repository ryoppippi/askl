# askl

A standalone command-line linter for the portable
[Agent Skills](https://agentskills.io/specification) format and host-specific
skill authoring conventions.

Every diagnostic points directly at the real `SKILL.md` file and line — `askl`
reads Markdown and YAML frontmatter itself, so it needs no host linter, no
JavaScript/TypeScript anchor file, and no project `node_modules` to run.

```text
.agents/skills/example/SKILL.md:2 error Frontmatter requires a description field. (valid-frontmatter)

1 error, 0 warnings
```

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/ryoppippi/oxlint-plugin-agent-skills/main/scripts/install.sh | sh
```

This downloads a prebuilt, dependency-free binary from
[GitHub Releases](https://github.com/ryoppippi/oxlint-plugin-agent-skills/releases),
verifies its SHA-256 checksum against the release's `checksums.txt`, and
installs it to `~/.local/bin/askl` (override with `ASKL_INSTALL_DIR`).

## Nix

The project also provides Nix flake outputs for users who already use Nix.
The flake builds `askl` from source — see `flake.nix` and `package.nix` for
details.

```sh
# Run without installing
nix run github:ryoppippi/oxlint-plugin-agent-skills

# Install into your profile
nix profile install github:ryoppippi/oxlint-plugin-agent-skills
```

## Usage

```sh
askl                       # lint the default skill roots
askl --format json         # machine-readable output for scripting
askl --format github       # GitHub Actions workflow-command annotations
askl --list-rules          # print every registered rule
askl --help                # full flag reference
```

| Flag                       | Description                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `-r, --roots <dir>`        | Skill root directory to scan (repeatable)                               |
| `-c, --config <file>`      | Path to a config file (default: nearest `.asklrc.jsonc`/`.asklrc.json`) |
| `-f, --format <fmt>`       | `pretty` (default), `json`, `unix`, or `github`                         |
| `--rule <name>=<severity>` | Override one rule's severity (`off`, `warn`, or `error`) for this run   |
| `--deny-warnings`          | Exit non-zero when only warnings are found                              |
| `--list-rules`             | Print every registered rule and exit                                    |

Exit codes: `0` clean, `1` a rule reported an error (or a warning with
`--deny-warnings`), `2` a usage or config problem.

By default, `askl` scans these paths relative to its working directory:

- `.agent/skills`
- `.agents/skills`
- `.claude/skills`
- `agents/skills`
- `skills`

These are compatibility roots for different agent hosts. Claude Code natively
scans `.claude/skills` for project-level skills, and Codex natively scans
`.agents/skills` from the current working directory up to the repository
root; the other defaults do not imply native discovery support for either
host.

## Configure

`askl` reads the nearest `.asklrc.jsonc` (or `.asklrc.json`), searching from
the current directory upward. JSON with comments and trailing commas is
supported:

```jsonc
{
	// Restrict scanning to Codex's and Claude Code's native roots.
	"roots": [".agents/skills", ".claude/skills"],
	"rules": {
		"valid-frontmatter": "error",
		"name-matches-directory": "error",
		"no-duplicate-skill-name": "error",
		"no-empty-skill-body": "error",
		"skill-index-budget": ["warn", { "maxCharacters": 20000 }],
		"max-skill-lines": ["warn", { "maxLines": 200 }],
		"no-broken-local-references": "error",
		"long-reference-has-toc": "warn",
		"no-deep-references": "warn",
		"no-windows-paths": "warn",
		"description-third-person": "warn",
		// Opt-in: stricter than the recommended preset below.
		"no-unknown-frontmatter-fields": "off",
	},
}
```

Every rule not mentioned in the config file falls back to its recommended
default: `error` for every rule except `no-unknown-frontmatter-fields`, which
defaults to `off`. `--roots` and `--rule` on the command line take precedence
over the config file for a single invocation.

## Rules

| Rule                                                                                 | Checks                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`valid-frontmatter`](src/rules/valid-frontmatter/README.md)                         | Valid YAML, required `name` and `description`, field lengths and types, naming syntax, XML tags, and reserved names                            |
| [`name-matches-directory`](src/rules/name-matches-directory/README.md)               | Frontmatter `name` matches the directory containing `SKILL.md`                                                                                 |
| [`no-duplicate-skill-name`](src/rules/no-duplicate-skill-name/README.md)             | Frontmatter `name` is unique across all configured skill roots                                                                                 |
| [`no-empty-skill-body`](src/rules/no-empty-skill-body/README.md)                     | `SKILL.md` includes instructions after its frontmatter                                                                                         |
| [`skill-index-budget`](src/rules/skill-index-budget/README.md)                       | Combined `name` and `description` size across all skills stays within a configurable character budget                                          |
| [`max-skill-lines`](src/rules/max-skill-lines/README.md)                             | `SKILL.md` stays within a configurable line limit, defaulting to 200                                                                           |
| [`no-broken-local-references`](src/rules/no-broken-local-references/README.md)       | Relative Markdown references resolve to an existing file or directory, scoped to the skill directory by default                                |
| [`long-reference-has-toc`](src/rules/long-reference-has-toc/README.md)               | Long referenced text files provide a linked table of contents near the top                                                                     |
| [`no-deep-references`](src/rules/no-deep-references/README.md)                       | Relative Markdown links, images, and definitions point no deeper than one directory below `SKILL.md`, scoped to the skill directory by default |
| [`no-windows-paths`](src/rules/no-windows-paths/README.md)                           | Relative Markdown reference targets use forward slashes, not Windows-style backslashes                                                         |
| [`description-third-person`](src/rules/description-third-person/README.md)           | `description` is written in the third person, not first or second person                                                                       |
| [`no-unknown-frontmatter-fields`](src/rules/no-unknown-frontmatter-fields/README.md) | Frontmatter has no fields outside the specification and Claude Code's documented extensions (opt-in; not in the recommended preset)            |

Index budgets are host-dependent. Codex uses at most 2% of the model context
window for its initial skill list, or 8,000 characters when the context window
is unknown. Projects targeting that fallback can configure
`skill-index-budget` with `{ "maxCharacters": 8000 }`; other hosts can retain
or choose a different explicit budget.

## Suppressing a diagnostic

Add an HTML comment to the `SKILL.md` source:

```text
<!-- askl-disable-next-line no-windows-paths -->
See [the Windows helper](scripts\help.ps1).
```

`<!-- askl-disable-next-line <rule> -->` suppresses `<rule>` for the line that
follows the comment; `<!-- askl-disable <rule> -->` suppresses it for the
whole file regardless of where the comment sits. Both accept a
space-or-comma-separated list of rule names, and omitting the list suppresses
every rule.

## Design requirements

The [rule requirements](docs/rule-requirements.md) map the portable Agent Skills
specification and platform-specific Claude and Codex guidance to current and
proposed lint rules.

## Sources

- [Agent Skills specification](https://agentskills.io/specification)
- [Claude skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Codex Agent Skills guide](https://developers.openai.com/codex/skills)
- [OpenAI skill examples](https://github.com/openai/skills)
- [Codex 220-line skill read analysis](https://www.reddit.com/r/codex/comments/1t1rbqt/codex_may_only_read_the_first_220_lines_of_a/)
- [Codex CLI SKILL.md reading depth: empirical findings](https://gist.github.com/haru0416-dev/8c1b01098f46e29d244f2085e408c789)

## GitHub Sponsors

<p align="center">
    <a href="https://github.com/sponsors/ryoppippi">
        <img src="https://sponsors.ryoppippi.com/sponsors.png" alt="Sponsors">
    </a>
</p>

## Development

<details>
<summary>Set up the development environment and run the checks</summary>

The Nix development shell provides Bun:

```sh
nix develop
bun install --frozen-lockfile
bun run check
```

`bun run check` runs formatting, linting, type checking, and tests.
`bun run build` compiles the CLI into a standalone `./askl` binary.

`nix build` builds the same binary through the `package.nix` derivation,
without needing a local Bun install.

</details>

## License

MIT
