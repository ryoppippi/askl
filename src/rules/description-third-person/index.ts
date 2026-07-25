/**
 * Implements `skills/description-third-person`.
 *
 * The `description` is injected into the system prompt so the agent can choose
 * between skills. Claude's authoring guidance requires it to be written in the
 * third person ("Processes Excel files"), because a first- or second-person
 * voice ("I can help you...", "You can use this...") harms skill discovery.
 *
 * To keep false positives low the rule only flags a description whose opening
 * word is an unambiguous first- or second-person pronoun followed by a space or
 * apostrophe. This deliberately ignores mid-sentence pronouns and never matches
 * imperative openings such as "Use when ..." (common in valid descriptions) or
 * words that merely start with those letters (for example "I/O" or
 * "Identifies"). It stays silent when the description is missing or otherwise
 * invalid, leaving that to `skills/valid-frontmatter`.
 *
 * @see https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
 */
import { createSkillRule } from '../../core/rule.ts';
import { parseFrontmatter } from '../valid-frontmatter/index.ts';

export interface DescriptionVoiceIssue {
	line: number;
	message: string;
}

// Match only a leading first/second-person word that is followed by a space,
// tab, or apostrophe (straight or curly). The trailing assertion stops "I/O",
// "Identifies", "Webhook", "Your"-prefixed real words, etc. from matching.
const FIRST_OR_SECOND_PERSON_OPENING = /^(i|we|you|your|my|our|let me)(?=[ \t'’])/iu;

/**
 * Oxlint rule that requires third-person skill descriptions.
 */
export const descriptionThirdPersonRule = createSkillRule(
	'Require skill descriptions to be written in the third person.',
	(_filePath, source) => validateDescriptionVoice(source),
);

export function validateDescriptionVoice(source: string): DescriptionVoiceIssue | undefined {
	const parsed = parseFrontmatter(source);
	const description = parsed.data?.description;

	// Missing/invalid descriptions are reported by valid-frontmatter.
	if (typeof description !== 'string' || description.length === 0) {
		return undefined;
	}

	const match = FIRST_OR_SECOND_PERSON_OPENING.exec(description.trimStart());

	if (match === null) {
		return undefined;
	}

	const descriptionLineIndex = parsed.lines.findIndex((line) => line.startsWith('description:'));

	return {
		line: descriptionLineIndex === -1 ? 1 : descriptionLineIndex + 1,
		message: `Description must be written in the third person; rewrite the opening "${match[1]}" to describe what the skill does (for example "Processes ..." not "I can ..." or "You can ...").`,
	};
}

if (import.meta.vitest) {
	test.each([
		'I can help you process Excel files. Use when handling spreadsheets.',
		'You can use this to process PDFs. Use when working with PDFs.',
		"We'll generate commit messages from staged diffs.",
		'Your assistant for reviewing pull requests before merge.',
	])('reports the first/second-person description %j', (description) => {
		const issue = validateDescriptionVoice(
			`---\nname: t\ndescription: ${description}\n---\n\n# Body\n`,
		);

		expect(issue?.line).toBe(3);
	});

	test.each([
		'Processes Excel files and generates reports. Use when analysing spreadsheets.',
		'Use when working with PDF files, forms, or document extraction.',
		'Identifies flaky tests from CI logs. Use when triaging failures.',
		'I/O profiling for hot paths. Use when diagnosing latency.',
	])('accepts the third-person description %j', (description) => {
		const issue = validateDescriptionVoice(
			`---\nname: t\ndescription: ${description}\n---\n\n# Body\n`,
		);

		expect(issue).toBeUndefined();
	});

	test('stays silent when the description is missing', () => {
		expect(validateDescriptionVoice('---\nname: t\n---\n\n# Body\n')).toBeUndefined();
	});
}
