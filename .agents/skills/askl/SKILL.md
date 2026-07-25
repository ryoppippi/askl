---
name: askl
description: Lints Agent Skills against the Agent Skills specification and host authoring conventions. Use when writing, reviewing, or fixing SKILL.md files or their referenced documents.
license: MIT
---

# askl

`askl` is a standalone command-line linter for the [Agent Skills
specification](https://agentskills.io/specification). It scans every
`SKILL.md` under a repository's skill roots, validates frontmatter and
referenced Markdown files, and reports issues with exact file and line
positions.

## Running it

```sh
askl                       # lint the default skill roots
askl --format json         # machine-readable output
askl --list-rules          # show every registered rule
```

Default skill roots (relative to the current working directory):
`.agent/skills`, `.agents/skills`, `.claude/skills`, `agents/skills`,
`skills`.

Exit codes: `0` clean, `1` a rule reported an error (or a warning with
`--deny-warnings`), `2` a usage or config problem (bad `--rule` value,
invalid config file).

## Fixing a reported issue

1. Read the diagnostic: `<file>:<line> error <message> (<rule>)`.
2. Open `<file>` at `<line>` and address `<message>` directly — every rule
   message states exactly what must change.
3. Re-run `askl` to confirm the fix and check for any remaining issues.

Common fixes:

- **`valid-frontmatter`**: add the missing `name`/`description` field, fix the
  YAML, or shorten a field past its length limit.
- **`name-matches-directory`**: rename the skill's `name` field or its
  directory so they match.
- **`no-broken-local-references` / `no-deep-references`**: fix the Markdown
  link target, or move the referenced file to at most one directory below
  `SKILL.md`.
- **`no-empty-skill-body`**: add instructions after the closing `---`.
- **`skill-index-budget`**: shorten `name`/`description` across the flagged
  skills, since the message reports a combined total, not one file's size.

## Suppressing a specific diagnostic

Only suppress a diagnostic when the rule's rationale genuinely does not apply
to that line — never to silence an unaddressed real issue. Add an HTML
comment to the `SKILL.md` source:

```text
<!-- askl-disable-next-line no-windows-paths -->
See [the Windows helper](scripts\help.ps1).
```

`<!-- askl-disable-next-line <rule> -->` suppresses `<rule>` for the line that
follows the comment; `<!-- askl-disable <rule> -->` suppresses it for the
whole file regardless of where the comment sits. Both accept a
space-or-comma-separated list of rule names, and omitting the list suppresses
every rule.

## Configuring rules

`askl` reads the nearest `.asklrc.jsonc` (or `.asklrc.json`), searching from
the current directory upward:

```jsonc
{
	"roots": [".agents/skills"],
	"rules": {
		"no-unknown-frontmatter-fields": "error",
		"skill-index-budget": ["warn", { "maxCharacters": 8000 }],
	},
}
```

`--roots` and `--rule <name>=<off|warn|error>` on the command line override
the config file for a single invocation.
