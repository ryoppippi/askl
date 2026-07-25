/**
 * Runs every registered rule against the skills discovered under a
 * repository's configured roots and returns their findings as diagnostics.
 *
 * A rule may declare its own `roots` option (see `readRoots` in
 * `core/rule.ts`), so discovery results are cached per distinct roots list
 * rather than once globally: most rules share the default roots and reuse a
 * single discovery pass, while a rule scoped to a custom root triggers its
 * own pass.
 */
import { rules } from '../rules.ts';
import { DEFAULT_SKILL_ROOTS, discoverSkills, displayPath, readRoots } from './rule.ts';
import { isSuppressed, parseSuppressions } from './suppressions.ts';
import type { DiscoveredSkill } from './rule.ts';
import type { ParsedSuppressions } from './suppressions.ts';

export type Severity = 'error' | 'warn';

export type RuleSeverityConfig = 'off' | Severity | readonly [Severity, unknown];

export interface LintConfig {
	cwd: string;
	roots?: readonly string[];
	rules: Readonly<Record<string, RuleSeverityConfig>>;
}

export interface Diagnostic {
	file: string;
	line: number;
	message: string;
	rule: string;
	severity: Severity;
}

export function lint(config: LintConfig): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const skillsByRootsKey = new Map<string, readonly DiscoveredSkill[]>();
	// Suppression comments are a property of the file, not of any one rule, so
	// each file's source is parsed for `askl-disable` comments only once across
	// the whole run, however many rules touch it.
	const suppressionsByFilePath = new Map<string, ParsedSuppressions>();

	for (const [name, rule] of Object.entries(rules)) {
		const resolved = resolveSeverity(config.rules[name], rule.recommended);

		if (resolved === undefined) {
			continue;
		}

		const [severity, option] = resolved;
		const roots = readRoots(option) ?? config.roots ?? DEFAULT_SKILL_ROOTS;
		const rootsKey = roots.join('\0');
		let skills = skillsByRootsKey.get(rootsKey);

		if (skills === undefined) {
			skills = discoverSkills(config.cwd, roots);
			skillsByRootsKey.set(rootsKey, skills);
		}

		const skillByFilePath = new Map(skills.map((skill) => [skill.filePath, skill]));

		// The rule registry is intentionally heterogeneous (each rule has its own
		// options type), so `check` is typed to accept `never` and callers narrow
		// with their own runtime guards; `option` is only ever `unknown` here.
		for (const issue of rule.check(skills, option as never)) {
			const skill = skillByFilePath.get(issue.filePath);

			if (skill !== undefined) {
				let suppressions = suppressionsByFilePath.get(issue.filePath);

				if (suppressions === undefined) {
					suppressions = parseSuppressions(skill.source);
					suppressionsByFilePath.set(issue.filePath, suppressions);
				}

				if (isSuppressed(suppressions, issue.line, name)) {
					continue;
				}
			}

			diagnostics.push({
				file: skill?.displayPath ?? displayPath(config.cwd, issue.filePath),
				line: issue.line,
				message: issue.message,
				rule: name,
				severity,
			});
		}
	}

	return diagnostics.toSorted(compareDiagnostics);
}

function resolveSeverity(
	entry: RuleSeverityConfig | undefined,
	recommended: boolean,
): readonly [Severity, unknown] | undefined {
	if (entry === undefined) {
		return recommended ? ['error', undefined] : undefined;
	}

	if (entry === 'off') {
		return undefined;
	}

	if (typeof entry === 'string') {
		return [entry, undefined];
	}

	return entry;
}

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
	return a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule);
}

if (import.meta.vitest) {
	test('applies the recommended preset by default', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/empty/SKILL.md': '---\nname: empty\ndescription: Does nothing.\n---\n',
		});

		const diagnostics = lint({ cwd: fixture.path, rules: {} });

		expect(diagnostics).toContainEqual(
			expect.objectContaining({ rule: 'no-empty-skill-body', severity: 'error' }),
		);
		expect(diagnostics.some((d) => d.rule === 'no-unknown-frontmatter-fields')).toBe(false);
	});

	test('turns a rule off', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/empty/SKILL.md': '---\nname: empty\ndescription: Does nothing.\n---\n',
		});

		const diagnostics = lint({
			cwd: fixture.path,
			rules: { 'no-empty-skill-body': 'off' },
		});

		expect(diagnostics.some((d) => d.rule === 'no-empty-skill-body')).toBe(false);
	});

	test('passes rule options through', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/example/SKILL.md':
				'---\nname: example\ndescription: Does the thing.\n---\n\n# Body\n',
		});

		const diagnostics = lint({
			cwd: fixture.path,
			rules: { 'skill-index-budget': ['error', { maxCharacters: 1 }] },
		});

		expect(diagnostics).toContainEqual(
			expect.objectContaining({ rule: 'skill-index-budget', severity: 'error' }),
		);
	});

	test('a rule-level roots option scopes discovery for that rule only', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'company/skills/custom/SKILL.md': '---\nname: custom\n---\n',
		});

		const diagnostics = lint({
			cwd: fixture.path,
			rules: { 'valid-frontmatter': ['error', { roots: ['company/skills'] }] },
		});

		expect(diagnostics).toEqual([
			expect.objectContaining({
				file: 'company/skills/custom/SKILL.md',
				rule: 'valid-frontmatter',
			}),
		]);
	});

	test('sorts diagnostics by file then line then rule', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/a/SKILL.md': '---\n---\n',
			'.agents/skills/b/SKILL.md': '---\n---\n',
		});

		const diagnostics = lint({ cwd: fixture.path, rules: {} });

		const files = diagnostics.map((d) => d.file);

		expect(files).toEqual(files.toSorted());
	});

	test('an askl-disable comment suppresses a rule for the whole file regardless of position', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/example/SKILL.md':
				'---\nname: example\ndescription: Does the thing.\n---\n\nSee [helper](scripts\\helper.py).\n\n<!-- askl-disable no-windows-paths -->\n\nSee [other](scripts\\other.py).\n',
		});

		const diagnostics = lint({ cwd: fixture.path, rules: {} });

		expect(diagnostics.some((d) => d.rule === 'no-windows-paths')).toBe(false);
	});

	test('an askl-disable-next-line comment only suppresses the following line', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/example/SKILL.md':
				'---\nname: example\ndescription: Does the thing.\n---\n\n<!-- askl-disable-next-line no-windows-paths -->\nSee [helper](scripts\\helper.py).\n\nSee [other](scripts\\other.py).\n',
		});

		const diagnostics = lint({ cwd: fixture.path, rules: {} });
		const windowsPathDiagnostics = diagnostics.filter((d) => d.rule === 'no-windows-paths');

		expect(windowsPathDiagnostics).toHaveLength(1);
		expect(windowsPathDiagnostics[0]?.line).toBe(9);
	});
}
