/**
 * Implements `skills/skill-index-budget`.
 *
 * An agent does not load every SKILL.md body up front. Instead it loads the
 * "index": the `name` and `description` of every discovered skill, all at once,
 * so it can decide which skill to activate. That index is paid on every request
 * and competes with the user's own context. As a repository accumulates skills,
 * the combined index can quietly grow large enough to crowd out useful context.
 *
 * This rule sums the `name` and `description` characters across all discovered
 * skills and reports a single finding when the total exceeds a configurable
 * budget. Character count is a deliberately coarse, dependency-free proxy for
 * token usage; the default budget is an operational safeguard, not an Agent
 * Skills specification limit.
 *
 * The finding is anchored at the first contributing skill (skills are sorted by
 * path) because the budget is a property of the whole collection rather than
 * any single file; the message describes the aggregate.
 *
 * Unlike the per-file rules, this one inspects every discovered skill at once,
 * so it relies on `createAggregateSkillRule`.
 *
 * @see https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
 */
import type { AggregateSkillIssue, DiscoveredSkill } from '../../core/rule.ts';

import { createAggregateSkillRule } from '../../core/rule.ts';
import { parseFrontmatter } from '../valid-frontmatter/index.ts';

export const DEFAULT_MAX_INDEX_CHARACTERS = 20_000;

/**
 * Oxlint rule that bounds the combined size of every skill's discovery metadata.
 */
export const skillIndexBudgetRule = createAggregateSkillRule(
	'Limit the combined size of every skill name and description.',
	validateSkillIndexBudget,
);

export function validateSkillIndexBudget(
	skills: readonly DiscoveredSkill[],
	option?: unknown,
): AggregateSkillIssue[] {
	const maxCharacters = readMaxCharacters(option);
	let total = 0;
	let counted = 0;
	let anchor: DiscoveredSkill | undefined;

	// Every skill contributes its name and description to the loaded index.
	// Skills without either field contribute nothing and are skipped.
	for (const skill of skills) {
		const parsed = parseFrontmatter(skill.source);
		const name = parsed.data?.name;
		const description = parsed.data?.description;
		const contribution =
			(typeof name === 'string' ? name.length : 0) +
			(typeof description === 'string' ? description.length : 0);

		if (contribution === 0) {
			continue;
		}

		total += contribution;
		counted += 1;
		anchor ??= skill;
	}

	if (anchor === undefined || total <= maxCharacters) {
		return [];
	}

	return [
		{
			filePath: anchor.filePath,
			line: 1,
			message: `Combined skill index is ${total} characters across ${counted} skills; keep names and descriptions at or below ${maxCharacters} characters so the index does not crowd the agent context.`,
		},
	];
}

function readMaxCharacters(option: unknown): number {
	if (
		typeof option === 'object' &&
		option !== null &&
		'maxCharacters' in option &&
		typeof option.maxCharacters === 'number' &&
		Number.isInteger(option.maxCharacters) &&
		option.maxCharacters >= 1
	) {
		return option.maxCharacters;
	}

	return DEFAULT_MAX_INDEX_CHARACTERS;
}

function skillFixture(name: string, description: string): DiscoveredSkill {
	return {
		displayPath: `skills/${name}/SKILL.md`,
		filePath: `/skills/${name}/SKILL.md`,
		source: `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
	};
}

if (import.meta.vitest) {
	test('accepts an index within the budget', () => {
		const skills = [
			skillFixture('commit', 'Writes commits.'),
			skillFixture('review', 'Reviews code.'),
		];

		expect(validateSkillIndexBudget(skills)).toEqual([]);
	});

	test('reports a combined index over the configured budget', () => {
		const skills = [skillFixture('commit', 'a'.repeat(40)), skillFixture('review', 'b'.repeat(40))];

		expect(validateSkillIndexBudget(skills, { maxCharacters: 50 })).toEqual([
			{
				filePath: skills[0]?.filePath,
				line: 1,
				message:
					'Combined skill index is 92 characters across 2 skills; keep names and descriptions at or below 50 characters so the index does not crowd the agent context.',
			},
		]);
	});

	test('ignores skills without name or description', () => {
		const skills = [
			{
				displayPath: 'skills/empty/SKILL.md',
				filePath: '/skills/empty/SKILL.md',
				source: '# no frontmatter\n',
			},
		];

		expect(validateSkillIndexBudget(skills, { maxCharacters: 1 })).toEqual([]);
	});
}
