import { dirname, resolve } from 'node:path';

import { escapesDirectory, isPathInsideDirectory, targetExists } from '../../core/file-paths.ts';
import { collectLocalMarkdownReferences } from '../../core/markdown-references.ts';
import { createSkillRule } from '../../core/rule.ts';

export interface LocalReferenceIssue {
	line: number;
	message: string;
}

export const noBrokenLocalReferencesRule = createSkillRule(
	'Require local SKILL.md references to resolve inside the skill directory.',
	(filePath, source, option) =>
		validateLocalReferences(filePath, source, readAllowOutsideSkillDirectory(option)),
);

export function validateLocalReferences(
	filePath: string,
	source: string,
	allowOutsideSkillDirectory = false,
): LocalReferenceIssue[] {
	const issues: LocalReferenceIssue[] = [];
	const skillDirectory = dirname(filePath);

	for (const { line, path, url } of collectLocalMarkdownReferences(source)) {
		const target = resolve(skillDirectory, path);

		if (escapesDirectory(skillDirectory, target)) {
			if (!allowOutsideSkillDirectory) {
				issues.push({
					line,
					message: `Reference "${url}" escapes the skill directory.`,
				});
			} else if (!targetExists(target)) {
				issues.push({
					line,
					message: `Reference "${url}" does not resolve to an existing file or directory.`,
				});
			}
		} else if (!isPathInsideDirectory(skillDirectory, target)) {
			issues.push({
				line,
				message: `Reference "${url}" does not resolve to a file or directory in this skill.`,
			});
		}
	}

	return issues;
}

function readAllowOutsideSkillDirectory(option: unknown): boolean {
	return (
		typeof option === 'object' &&
		option !== null &&
		'allowOutsideSkillDirectory' in option &&
		option.allowOutsideSkillDirectory === true
	);
}

if (import.meta.vitest) {
	test('accepts existing local references with fragments', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'references/guide.md': '# Guide\n',
		});

		expect(
			validateLocalReferences(
				fixture.getPath('SKILL.md'),
				'Read [the guide](references/guide.md#usage).\n',
			),
		).toEqual([]);
	});

	test('reports missing local references at their source line', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture();

		expect(
			validateLocalReferences(
				fixture.getPath('SKILL.md'),
				'# Instructions\n\nRead [the guide](references/missing.md).\n',
			),
		).toEqual([
			{
				line: 3,
				message:
					'Reference "references/missing.md" does not resolve to a file or directory in this skill.',
			},
		]);
	});

	test('rejects references that escape the skill directory', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'outside.md': '# Outside\n',
			skill: {},
		});

		expect(
			validateLocalReferences(
				fixture.getPath('skill/SKILL.md'),
				'Read [outside](../outside.md).\n',
			),
		).toEqual([
			{
				line: 1,
				message: 'Reference "../outside.md" escapes the skill directory.',
			},
		]);
	});

	test('ignores external links, fragments, and link examples in code blocks', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture();
		const source =
			'[site](https://example.com) [section](#section)\n\n```markdown\n[example](missing.md)\n```\n';

		expect(validateLocalReferences(fixture.getPath('SKILL.md'), source)).toEqual([]);
	});

	test('validates image and definition targets', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture();

		expect(
			validateLocalReferences(
				fixture.getPath('SKILL.md'),
				'![missing](assets/missing.png)\n\n[guide]: references/missing.md\n',
			),
		).toEqual([
			{
				line: 1,
				message:
					'Reference "assets/missing.png" does not resolve to a file or directory in this skill.',
			},
			{
				line: 3,
				message:
					'Reference "references/missing.md" does not resolve to a file or directory in this skill.',
			},
		]);
	});

	test('accepts a reference to an existing directory', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'references/guide.md': '# Guide\n',
		});

		expect(
			validateLocalReferences(fixture.getPath('SKILL.md'), 'See [references](references/).\n'),
		).toEqual([]);
	});

	test('rejects an out-of-directory reference by default even when the target exists', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'shared/guide.md': '# Shared guide\n',
			skill: {},
		});

		expect(
			validateLocalReferences(
				fixture.getPath('skill/SKILL.md'),
				'Read [shared](../shared/guide.md).\n',
			),
		).toEqual([
			{
				line: 1,
				message: 'Reference "../shared/guide.md" escapes the skill directory.',
			},
		]);
	});

	test('accepts an out-of-directory reference when allowOutsideSkillDirectory is set and the target exists', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'shared/guide.md': '# Shared guide\n',
			skill: {},
		});

		expect(
			validateLocalReferences(
				fixture.getPath('skill/SKILL.md'),
				'Read [shared](../shared/guide.md).\n',
				true,
			),
		).toEqual([]);
	});

	test('reports a missing out-of-directory reference even when allowOutsideSkillDirectory is set', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			skill: {},
		});

		expect(
			validateLocalReferences(
				fixture.getPath('skill/SKILL.md'),
				'Read [shared](../shared/missing.md).\n',
				true,
			),
		).toEqual([
			{
				line: 1,
				message:
					'Reference "../shared/missing.md" does not resolve to an existing file or directory.',
			},
		]);
	});
}
