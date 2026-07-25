/**
 * Implements `skills/no-empty-skill-body`.
 *
 * Frontmatter only describes when to activate a skill; the body after the
 * closing `---` is the instruction set the agent actually follows. A SKILL.md
 * with valid frontmatter but no body activates yet tells the agent nothing, so
 * this rule reports any skill whose body is empty or only whitespace.
 *
 * Frontmatter is parsed through the `valid-frontmatter` parser. When it is
 * missing or invalid this rule stays silent; `skills/valid-frontmatter` owns
 * that diagnostic and prevents duplicate errors for the same root cause.
 *
 * @see https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
 */
import { createSkillRule } from '../../core/rule.ts';
import { parseFrontmatter } from '../valid-frontmatter/index.ts';

export interface SkillBodyIssue {
	line: number;
	message: string;
}

/**
 * Oxlint rule that requires instructions below the frontmatter of every skill.
 */
export const noEmptySkillBodyRule = createSkillRule(
	'Require SKILL.md to include instructions after its frontmatter.',
	(_filePath, source) => validateSkillBody(source),
);

export function validateSkillBody(source: string): SkillBodyIssue | undefined {
	const parsed = parseFrontmatter(source);

	// A missing or unparsable frontmatter block is reported by
	// `valid-frontmatter`; without a valid block there is no body to judge.
	if (parsed.data === undefined) {
		return undefined;
	}

	// Locate the closing delimiter so everything after it can be treated as the
	// body. `parseFrontmatter` guarantees this line exists once `data` is set.
	const closingLineIndex = parsed.lines.findIndex((line, index) => index > 0 && line === '---');
	const body = parsed.lines
		.slice(closingLineIndex + 1)
		.join('\n')
		.trim();

	if (body.length > 0) {
		return undefined;
	}

	return {
		line: closingLineIndex + 1,
		message: 'SKILL.md has no body; add instructions after the closing --- delimiter.',
	};
}

if (import.meta.vitest) {
	test('accepts a SKILL.md with body instructions', () => {
		expect(
			validateSkillBody(
				'---\nname: with-body\ndescription: Does the thing.\n---\n\n# Instructions\n',
			),
		).toBeUndefined();
	});

	test('reports a SKILL.md with only frontmatter', () => {
		expect(validateSkillBody('---\nname: empty\ndescription: Empty.\n---\n')).toEqual({
			line: 4,
			message: 'SKILL.md has no body; add instructions after the closing --- delimiter.',
		});
	});

	test('stays silent when frontmatter is missing', () => {
		expect(validateSkillBody('# No frontmatter here\n')).toBeUndefined();
	});
}
