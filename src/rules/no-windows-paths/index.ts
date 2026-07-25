/**
 * Implements `skills/no-windows-paths`.
 *
 * Agent Skill authoring guidance requires forward slashes in file references:
 * Windows-style backslash paths such as `scripts\helper.py` break when an agent
 * runs on a Unix system. This rule reports relative Markdown links, images, and
 * definitions whose target contains a backslash.
 *
 * To avoid false positives the rule inspects only parsed Markdown reference
 * targets — never prose or fenced code — reusing the same mdast traversal as
 * `no-deep-references`. A backslash in a code sample, regular expression, or
 * escape sequence is therefore never flagged; only an actual link/image target
 * is. Protocol URLs, absolute paths, and fragments are left alone.
 *
 * @see https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
 */
import { collectLocalMarkdownReferences } from '../../core/markdown-references.ts';
import { createSkillRule } from '../../core/rule.ts';

export interface WindowsPathIssue {
	line: number;
	message: string;
}

/**
 * Oxlint rule that rejects backslash file references in SKILL.md.
 */
export const noWindowsPathsRule = createSkillRule(
	'Require forward slashes in SKILL.md file references.',
	(_filePath, source) => validateWindowsPaths(source),
);

export function validateWindowsPaths(source: string): WindowsPathIssue[] {
	return collectLocalMarkdownReferences(source)
		.filter(({ url }) => url.includes('\\'))
		.map(({ line, url }) => ({
			line,
			message: `Reference "${url}" uses a Windows-style path; use forward slashes (/) in skill file references.`,
		}));
}

if (import.meta.vitest) {
	test('accepts forward-slash references', () => {
		expect(validateWindowsPaths('See [the helper](scripts/helper.py).\n')).toEqual([]);
	});

	test('reports a backslash reference target', () => {
		expect(validateWindowsPaths('See [the helper](scripts\\helper.py).\n')).toEqual([
			{
				line: 1,
				message:
					'Reference "scripts\\helper.py" uses a Windows-style path; use forward slashes (/) in skill file references.',
			},
		]);
	});

	test('ignores backslashes outside reference targets', () => {
		const source =
			'---\nname: t\ndescription: d\n---\n\nThe regex `\\d+\\w` and a path scripts\\helper.py in prose.\n\n```\nrun scripts\\build.sh\n```\n';

		expect(validateWindowsPaths(source)).toEqual([]);
	});
}
