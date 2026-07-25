import { rules } from '../rules.ts';

export function formatRuleList(): string {
	const lines = Object.entries(rules)
		.toSorted(([a], [b]) => a.localeCompare(b))
		.map(([name, rule]) => `${name}${rule.recommended ? '' : ' (opt-in)'} - ${rule.description}`);

	return `${lines.join('\n')}\n`;
}

if (import.meta.vitest) {
	test('lists every rule with an opt-in marker for non-recommended rules', () => {
		const output = formatRuleList();

		expect(output).toContain('valid-frontmatter - ');
		expect(output).toContain('no-unknown-frontmatter-fields (opt-in) - ');
		expect(output).not.toContain('valid-frontmatter (opt-in)');
	});
}
