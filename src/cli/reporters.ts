/**
 * Renders lint diagnostics for each supported `--format`.
 *
 * `unix` matches the classic one-line-per-diagnostic linter format; `github`
 * emits GitHub Actions workflow commands so a diagnostic annotates its exact
 * file and line in a pull request's Files tab.
 */
import type { Diagnostic } from '../core/lint.ts';

export const REPORTER_FORMATS = ['pretty', 'json', 'unix', 'github'] as const;

export type ReporterFormat = (typeof REPORTER_FORMATS)[number];

export function isReporterFormat(value: string): value is ReporterFormat {
	return (REPORTER_FORMATS as readonly string[]).includes(value);
}

export function format(diagnostics: readonly Diagnostic[], reporter: ReporterFormat): string {
	switch (reporter) {
		case 'pretty': {
			return formatPretty(diagnostics);
		}
		case 'json': {
			return formatJson(diagnostics);
		}
		case 'unix': {
			return formatUnix(diagnostics);
		}
		case 'github': {
			return formatGithub(diagnostics);
		}
	}
}

function formatPretty(diagnostics: readonly Diagnostic[]): string {
	if (diagnostics.length === 0) {
		return 'No issues found.\n';
	}

	const lines = diagnostics.map(
		(d) =>
			`${d.file}:${d.line} ${d.severity === 'error' ? 'error' : 'warning'} ${d.message} (${d.rule})`,
	);
	const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
	const warningCount = diagnostics.length - errorCount;

	lines.push(
		'',
		`${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`,
	);

	return `${lines.join('\n')}\n`;
}

function formatJson(diagnostics: readonly Diagnostic[]): string {
	return `${JSON.stringify(diagnostics, null, '\t')}\n`;
}

function formatUnix(diagnostics: readonly Diagnostic[]): string {
	if (diagnostics.length === 0) {
		return '';
	}

	return `${diagnostics.map((d) => `${d.file}:${d.line}: ${d.message} [${d.severity}/${d.rule}]`).join('\n')}\n`;
}

function formatGithub(diagnostics: readonly Diagnostic[]): string {
	if (diagnostics.length === 0) {
		return '';
	}

	return `${diagnostics
		.map((d) => {
			const command = d.severity === 'error' ? 'error' : 'warning';
			return `::${command} file=${escapeProperty(d.file)},line=${d.line}::${escapeData(d.message)} (${d.rule})`;
		})
		.join('\n')}\n`;
}

// GitHub workflow commands require these characters escaped in data and
// property values. Property values additionally escape `,` and `:`.
// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
function escapeData(value: string): string {
	return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function escapeProperty(value: string): string {
	return escapeData(value).replaceAll(',', '%2C').replaceAll(':', '%3A');
}

if (import.meta.vitest) {
	const sample: Diagnostic = {
		file: 'skills/example/SKILL.md',
		line: 3,
		message: 'Frontmatter requires a description field.',
		rule: 'valid-frontmatter',
		severity: 'error',
	};

	test('pretty reports a clean run', () => {
		expect(format([], 'pretty')).toBe('No issues found.\n');
	});

	test('pretty lists each diagnostic and a summary line', () => {
		expect(format([sample], 'pretty')).toBe(
			'skills/example/SKILL.md:3 error Frontmatter requires a description field. (valid-frontmatter)\n\n1 error, 0 warnings\n',
		);
	});

	test('json round-trips the diagnostics', () => {
		expect(JSON.parse(format([sample], 'json'))).toEqual([sample]);
	});

	test('unix matches file:line: message [severity/rule]', () => {
		expect(format([sample], 'unix')).toBe(
			'skills/example/SKILL.md:3: Frontmatter requires a description field. [error/valid-frontmatter]\n',
		);
	});

	test('unix is empty for a clean run', () => {
		expect(format([], 'unix')).toBe('');
	});

	test('github emits an escaped workflow command', () => {
		const diagnostic: Diagnostic = {
			...sample,
			message: 'Reference "a,b: c" is broken\nsee docs',
			severity: 'warn',
		};

		expect(format([diagnostic], 'github')).toBe(
			'::warning file=skills/example/SKILL.md,line=3::Reference "a,b: c" is broken%0Asee docs (valid-frontmatter)\n',
		);
	});
}
