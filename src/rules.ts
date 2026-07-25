/**
 * Registers every Agent Skill rule under its stable name.
 *
 * This registry is the single source of truth for the CLI's recommended
 * preset, the `--list-rules` output, and the lint engine that runs each rule
 * against the discovered skills.
 */
import type { RuleModule } from './core/rule.ts';

import { descriptionThirdPersonRule } from './rules/description-third-person/index.ts';
import { longReferenceHasTocRule } from './rules/long-reference-has-toc/index.ts';
import { maxSkillLinesRule } from './rules/max-skill-lines/index.ts';
import { nameMatchesDirectoryRule } from './rules/name-matches-directory/index.ts';
import { noBrokenLocalReferencesRule } from './rules/no-broken-local-references/index.ts';
import { noDeepReferencesRule } from './rules/no-deep-references/index.ts';
import { noDuplicateSkillNameRule } from './rules/no-duplicate-skill-name/index.ts';
import { noEmptySkillBodyRule } from './rules/no-empty-skill-body/index.ts';
import { noUnknownFrontmatterFieldsRule } from './rules/no-unknown-frontmatter-fields/index.ts';
import { noWindowsPathsRule } from './rules/no-windows-paths/index.ts';
import { skillIndexBudgetRule } from './rules/skill-index-budget/index.ts';
import { validFrontmatterRule } from './rules/valid-frontmatter/index.ts';

export const rules: Readonly<Record<string, RuleModule<never>>> = {
	'description-third-person': descriptionThirdPersonRule,
	'long-reference-has-toc': longReferenceHasTocRule,
	'max-skill-lines': maxSkillLinesRule,
	'name-matches-directory': nameMatchesDirectoryRule,
	'no-broken-local-references': noBrokenLocalReferencesRule,
	'no-deep-references': noDeepReferencesRule,
	'no-duplicate-skill-name': noDuplicateSkillNameRule,
	'no-empty-skill-body': noEmptySkillBodyRule,
	'no-unknown-frontmatter-fields': noUnknownFrontmatterFieldsRule,
	'no-windows-paths': noWindowsPathsRule,
	'skill-index-budget': skillIndexBudgetRule,
	'valid-frontmatter': validFrontmatterRule,
};

export type RuleName = keyof typeof rules;

if (import.meta.vitest) {
	test('registers every rule under a stable name', () => {
		expect(Object.keys(rules).toSorted()).toEqual([
			'description-third-person',
			'long-reference-has-toc',
			'max-skill-lines',
			'name-matches-directory',
			'no-broken-local-references',
			'no-deep-references',
			'no-duplicate-skill-name',
			'no-empty-skill-body',
			'no-unknown-frontmatter-fields',
			'no-windows-paths',
			'skill-index-budget',
			'valid-frontmatter',
		]);
	});

	test('only no-unknown-frontmatter-fields is excluded from the recommended preset', () => {
		const nonRecommended = Object.entries(rules)
			.filter(([, rule]) => !rule.recommended)
			.map(([name]) => name);

		expect(nonRecommended).toEqual(['no-unknown-frontmatter-fields']);
	});
}
