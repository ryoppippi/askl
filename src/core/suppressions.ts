/**
 * Parses `askl-disable` HTML comments out of a SKILL.md source so the lint
 * engine can drop the diagnostics they suppress.
 *
 * `<!-- askl-disable-next-line rule-a rule-b -->` (or a comma-separated list)
 * suppresses those rules on the following line only; `<!-- askl-disable
 * rule-a -->` suppresses a rule for the rest of the file regardless of where
 * the comment sits. Either form without a rule list suppresses every rule.
 */
const DIRECTIVE_PATTERN = /<!--\s*askl-disable(-next-line)?(?:\s+([^>]*?))?\s*-->/;

export type RuleSelector = 'all' | ReadonlySet<string>;

export interface ParsedSuppressions {
	fileRules?: RuleSelector;
	nextLineRulesByLine: ReadonlyMap<number, RuleSelector>;
}

export function parseSuppressions(source: string): ParsedSuppressions {
	const lines = source.split(/\r?\n/);
	let fileRules: RuleSelector | undefined;
	const nextLineRulesByLine = new Map<number, RuleSelector>();

	for (const [index, line] of lines.entries()) {
		const match = DIRECTIVE_PATTERN.exec(line);

		if (match === null) {
			continue;
		}

		const isNextLine = match[1] !== undefined;
		const selector = parseRuleSelector(match[2]);

		if (isNextLine) {
			nextLineRulesByLine.set(
				index + 2,
				mergeSelectors(nextLineRulesByLine.get(index + 2), selector),
			);
		} else {
			fileRules = mergeSelectors(fileRules, selector);
		}
	}

	return { nextLineRulesByLine, ...(fileRules === undefined ? {} : { fileRules }) };
}

export function isSuppressed(
	suppressions: ParsedSuppressions,
	line: number,
	rule: string,
): boolean {
	if (matchesSelector(suppressions.fileRules, rule)) {
		return true;
	}

	return matchesSelector(suppressions.nextLineRulesByLine.get(line), rule);
}

function matchesSelector(selector: RuleSelector | undefined, rule: string): boolean {
	return selector === 'all' || (selector?.has(rule) ?? false);
}

function mergeSelectors(a: RuleSelector | undefined, b: RuleSelector): RuleSelector {
	if (a === undefined) {
		return b;
	}

	if (a === 'all' || b === 'all') {
		return 'all';
	}

	return new Set([...a, ...b]);
}

function parseRuleSelector(raw: string | undefined): RuleSelector {
	const names = raw
		?.trim()
		.split(/[\s,]+/)
		.filter((name) => name.length > 0);

	return names === undefined || names.length === 0 ? 'all' : new Set(names);
}

if (import.meta.vitest) {
	test('suppresses a rule on the line after a disable-next-line comment', () => {
		const suppressions = parseSuppressions(
			'line 1\n<!-- askl-disable-next-line no-windows-paths -->\nline 3\n',
		);

		expect(isSuppressed(suppressions, 3, 'no-windows-paths')).toBe(true);
	});

	test('disable-next-line only suppresses the listed rules', () => {
		const suppressions = parseSuppressions(
			'<!-- askl-disable-next-line no-windows-paths -->\nline 2\n',
		);

		expect(isSuppressed(suppressions, 2, 'no-windows-paths')).toBe(true);
		expect(isSuppressed(suppressions, 2, 'no-deep-references')).toBe(false);
		expect(isSuppressed(suppressions, 3, 'no-windows-paths')).toBe(false);
	});

	test('a bare disable-next-line suppresses every rule', () => {
		const suppressions = parseSuppressions('<!-- askl-disable-next-line -->\nline 2\n');

		expect(isSuppressed(suppressions, 2, 'no-windows-paths')).toBe(true);
		expect(isSuppressed(suppressions, 2, 'valid-frontmatter')).toBe(true);
	});

	test('supports a comma-separated rule list', () => {
		const suppressions = parseSuppressions(
			'<!-- askl-disable-next-line no-windows-paths, no-deep-references -->\nline 2\n',
		);

		expect(isSuppressed(suppressions, 2, 'no-windows-paths')).toBe(true);
		expect(isSuppressed(suppressions, 2, 'no-deep-references')).toBe(true);
		expect(isSuppressed(suppressions, 2, 'valid-frontmatter')).toBe(false);
	});

	test('askl-disable suppresses a rule for the whole file regardless of position', () => {
		const suppressions = parseSuppressions(
			'<!-- askl-disable no-empty-skill-body -->\nline 2\nline 3\n',
		);

		expect(isSuppressed(suppressions, 1, 'no-empty-skill-body')).toBe(true);
		expect(isSuppressed(suppressions, 200, 'no-empty-skill-body')).toBe(true);
		expect(isSuppressed(suppressions, 1, 'no-windows-paths')).toBe(false);
	});

	test('a bare askl-disable suppresses every rule for the whole file', () => {
		const suppressions = parseSuppressions('<!-- askl-disable -->\n');

		expect(isSuppressed(suppressions, 42, 'valid-frontmatter')).toBe(true);
	});

	test('leaves an undirected source with no suppressions', () => {
		const suppressions = parseSuppressions('# No directives here\n');

		expect(isSuppressed(suppressions, 1, 'valid-frontmatter')).toBe(false);
	});
}
