/**
 * Resolves a single lint invocation: config file, CLI overrides, and the
 * `roots`/`rules` merge order (CLI flags win over the config file, which wins
 * over each rule's recommended default).
 */
import { ConfigError, findConfigFile, loadConfig } from '../core/config.ts';
import { lint } from '../core/lint.ts';
import { rules } from '../rules.ts';
import { format } from './reporters.ts';
import type { RuleSeverityConfig } from '../core/lint.ts';
import type { ReporterFormat } from './reporters.ts';

export interface RunOptions {
	configPath?: string;
	cwd: string;
	denyWarnings: boolean;
	reporter: ReporterFormat;
	roots: readonly string[];
	ruleOverrides: readonly string[];
}

export interface RunResult {
	exitCode: 0 | 1 | 2;
	output: string;
}

const SEVERITIES = new Set(['off', 'warn', 'error']);

export function run(options: RunOptions): RunResult {
	let config;

	try {
		const configPath = options.configPath ?? findConfigFile(options.cwd);
		config = configPath === undefined ? {} : loadConfig(configPath);
	} catch (error) {
		if (error instanceof ConfigError) {
			return { exitCode: 2, output: `${error.message}\n` };
		}

		throw error;
	}

	const ruleConfig: Record<string, RuleSeverityConfig> = { ...config.rules };

	for (const override of options.ruleOverrides) {
		const parsed = parseRuleOverride(override);

		if (parsed === undefined) {
			return {
				exitCode: 2,
				output: `Invalid --rule value "${override}"; expected <rule-name>=<off|warn|error>.\n`,
			};
		}

		const [name, severity] = parsed;

		if (!(name in rules)) {
			return {
				exitCode: 2,
				output: `Unknown rule "${name}". Run --list-rules to see available rules.\n`,
			};
		}

		ruleConfig[name] = severity;
	}

	const roots = options.roots.length > 0 ? options.roots : config.roots;
	const diagnostics = lint({
		cwd: options.cwd,
		rules: ruleConfig,
		...(roots === undefined ? {} : { roots }),
	});
	const hasError = diagnostics.some((d) => d.severity === 'error');
	const hasWarning = diagnostics.some((d) => d.severity === 'warn');
	const exitCode = hasError || (options.denyWarnings && hasWarning) ? 1 : 0;

	return { exitCode, output: format(diagnostics, options.reporter) };
}

function parseRuleOverride(value: string): readonly [string, 'error' | 'off' | 'warn'] | undefined {
	const separatorIndex = value.indexOf('=');

	if (separatorIndex === -1) {
		return undefined;
	}

	const name = value.slice(0, separatorIndex);
	const severity = value.slice(separatorIndex + 1);

	if (!SEVERITIES.has(severity)) {
		return undefined;
	}

	return [name, severity as 'error' | 'off' | 'warn'];
}

if (import.meta.vitest) {
	test('reports a clean run with exit code 0', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/example/SKILL.md':
				'---\nname: example\ndescription: Does the thing.\n---\n\n# Body\n',
		});

		const result = run({
			cwd: fixture.path,
			denyWarnings: false,
			reporter: 'pretty',
			roots: [],
			ruleOverrides: [],
		});

		expect(result).toEqual({ exitCode: 0, output: 'No issues found.\n' });
	});

	test('exits 1 when a recommended rule fails', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/empty/SKILL.md': '---\nname: empty\ndescription: Does nothing.\n---\n',
		});

		const result = run({
			cwd: fixture.path,
			denyWarnings: false,
			reporter: 'json',
			roots: [],
			ruleOverrides: [],
		});

		expect(result.exitCode).toBe(1);
		expect(JSON.parse(result.output)).toContainEqual(
			expect.objectContaining({ rule: 'no-empty-skill-body' }),
		);
	});

	test('applies a --rule override', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/empty/SKILL.md': '---\nname: empty\ndescription: Does nothing.\n---\n',
		});

		const result = run({
			cwd: fixture.path,
			denyWarnings: false,
			reporter: 'json',
			roots: [],
			ruleOverrides: ['no-empty-skill-body=off'],
		});

		expect(result).toEqual({ exitCode: 0, output: '[]\n' });
	});

	test('rejects an unknown rule name with exit code 2', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({ 'skills/example': {} });

		const result = run({
			cwd: fixture.path,
			denyWarnings: false,
			reporter: 'json',
			roots: [],
			ruleOverrides: ['not-a-real-rule=off'],
		});

		expect(result.exitCode).toBe(2);
		expect(result.output).toContain('Unknown rule "not-a-real-rule"');
	});

	test('rejects a malformed --rule override with exit code 2', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({ 'skills/example': {} });

		const result = run({
			cwd: fixture.path,
			denyWarnings: false,
			reporter: 'json',
			roots: [],
			ruleOverrides: ['no-severity-here'],
		});

		expect(result.exitCode).toBe(2);
	});

	test('denyWarnings turns a warning-only run into exit code 1', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/typo/SKILL.md':
				'---\nname: typo\ndescription: Has a stray field.\nglobs: "*.ts"\n---\n\n# Body\n',
		});

		const withoutDenyWarnings = run({
			cwd: fixture.path,
			denyWarnings: false,
			reporter: 'json',
			roots: [],
			ruleOverrides: ['no-unknown-frontmatter-fields=warn'],
		});
		const withDenyWarnings = run({
			cwd: fixture.path,
			denyWarnings: true,
			reporter: 'json',
			roots: [],
			ruleOverrides: ['no-unknown-frontmatter-fields=warn'],
		});

		expect(withoutDenyWarnings.exitCode).toBe(0);
		expect(withDenyWarnings.exitCode).toBe(1);
	});

	test('an invalid config file reports exit code 2', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({ '.asklrc.jsonc': '{ not json' });

		const result = run({
			cwd: fixture.path,
			denyWarnings: false,
			reporter: 'json',
			roots: [],
			ruleOverrides: [],
		});

		expect(result.exitCode).toBe(2);
	});

	test('CLI roots take precedence over the config file', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.asklrc.jsonc': '{ "roots": ["other"] }',
			'skills/example/SKILL.md': '---\nname: example\n---\n',
		});

		const result = run({
			cwd: fixture.path,
			denyWarnings: false,
			reporter: 'json',
			roots: ['skills'],
			ruleOverrides: [],
		});

		expect(JSON.parse(result.output)).toContainEqual(
			expect.objectContaining({ file: 'skills/example/SKILL.md' }),
		);
	});
}
