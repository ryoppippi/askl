/**
 * Implements `skills/max-skill-lines`.
 *
 * SKILL.md is the instruction entry point loaded when an Agent Skill
 * activates, but not every host delivers it in full. Empirical analyses of
 * Codex CLI sessions found it reads skills with `sed -n '1,<N>p'` and stops
 * at a model-dependent boundary: gpt-5.5 truncated at line 220 in 39 of 47
 * observed reads and never followed up past the cap, while gpt-5.4 stopped
 * near line 260. Claude Code and OpenCode read SKILL.md in full. The default
 * of 200 lines keeps a safety margin below the tightest observed boundary,
 * matching the conservative 180-200 line recommendation from those
 * measurements. Anthropic's own guidance only asks for under 500 lines, so
 * this is an operational safeguard for the strictest host, not a limit in
 * the Agent Skills specification.
 *
 * Line counting follows text-file semantics: every newline terminates a line,
 * and a final unterminated fragment counts as one additional line. A trailing
 * newline does not create an extra empty line. The first line over the
 * configured maximum is used as the diagnostic location.
 *
 * The public Oxlint rule defaults to 200 lines and accepts any positive integer
 * through the `maxLines` option.
 *
 * @see https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
 * @see https://www.reddit.com/r/codex/comments/1t1rbqt/codex_may_only_read_the_first_220_lines_of_a/
 * @see https://gist.github.com/haru0416-dev/8c1b01098f46e29d244f2085e408c789
 */
import { createSkillRule } from '../../core/rule.ts';

export interface SkillLengthIssue {
	line: number;
	message: string;
}

/**
 * Oxlint rule that limits each SKILL.md entry point to a configurable length.
 */
export const maxSkillLinesRule = createSkillRule(
	'Limit SKILL.md instructions to a configurable number of lines.',
	(_filePath, source, option) => validateSkillLength(source, readMaxLines(option)),
);

export function validateSkillLength(source: string, maxLines = 200): SkillLengthIssue | undefined {
	const lineCount =
		source.length === 0 ? 0 : (source.match(/\n/g)?.length ?? 0) + (source.endsWith('\n') ? 0 : 1);

	if (lineCount <= maxLines) {
		return undefined;
	}

	return {
		line: maxLines + 1,
		message: `SKILL.md has ${lineCount} lines; keep it at or below ${maxLines} lines and move details into referenced files.`,
	};
}

function readMaxLines(option: unknown): number {
	if (
		typeof option === 'object' &&
		option !== null &&
		'maxLines' in option &&
		typeof option.maxLines === 'number' &&
		Number.isInteger(option.maxLines) &&
		option.maxLines >= 1
	) {
		return option.maxLines;
	}

	return 200;
}

if (import.meta.vitest) {
	test('accepts a SKILL.md with 200 lines', async () => {
		const { createFixture } = await import('fs-fixture');
		const { fileURLToPath } = await import('node:url');
		await using fixture = await createFixture(
			fileURLToPath(new URL('./__fixture__/valid', import.meta.url)),
		);

		expect(validateSkillLength(await fixture.readFile('SKILL.md', 'utf8'))).toBeUndefined();
	});

	test('reports a SKILL.md with more than 200 lines', async () => {
		const { createFixture } = await import('fs-fixture');
		const { fileURLToPath } = await import('node:url');
		await using fixture = await createFixture(
			fileURLToPath(new URL('./__fixture__/invalid', import.meta.url)),
		);

		expect(validateSkillLength(await fixture.readFile('SKILL.md', 'utf8'))).toEqual({
			line: 201,
			message:
				'SKILL.md has 201 lines; keep it at or below 200 lines and move details into referenced files.',
		});
	});

	test('uses a configured line limit', () => {
		expect(validateSkillLength('first\nsecond\nthird', 2)).toEqual({
			line: 3,
			message:
				'SKILL.md has 3 lines; keep it at or below 2 lines and move details into referenced files.',
		});
	});
}
