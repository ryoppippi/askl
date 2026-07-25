import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

import { escapesDirectory } from '../../core/file-paths.ts';
import {
	collectLocalMarkdownReferences,
	type LocalMarkdownReference,
} from '../../core/markdown-references.ts';
import { createSkillRule } from '../../core/rule.ts';

export const DEFAULT_MAX_REFERENCE_LINES = 100;

export interface ReferenceTableOfContentsIssue {
	line: number;
	message: string;
}

const TEXT_EXTENSIONS = new Set(['.adoc', '.md', '.mdx', '.rst', '.txt']);
const TABLE_OF_CONTENTS_LINK = /^\s*[-*+]\s+\[[^\]]+\]\(#[^)]+\)/;

export const longReferenceHasTocRule = createSkillRule(
	'Require long text references to include a table of contents near the top.',
	validateReferenceTablesOfContents,
);

export function validateReferenceTablesOfContents(
	filePath: string,
	source: string,
	option?: unknown,
): ReferenceTableOfContentsIssue[] {
	const issues: ReferenceTableOfContentsIssue[] = [];
	const skillDirectory = dirname(filePath);
	const maxLines = readMaxLines(option);

	for (const reference of collectLocalMarkdownReferences(source)) {
		if (reference.kind !== 'image') {
			validateReference(reference, skillDirectory, maxLines, issues);
		}
	}

	return issues;
}

function validateReference(
	referenceNode: LocalMarkdownReference,
	skillDirectory: string,
	maxLines: number,
	issues: ReferenceTableOfContentsIssue[],
): void {
	const { line, path, url } = referenceNode;
	const target = resolve(skillDirectory, path);

	if (
		!TEXT_EXTENSIONS.has(extname(target).toLowerCase()) ||
		escapesDirectory(skillDirectory, target)
	) {
		return;
	}

	let reference: string;

	try {
		reference = readFileSync(target, 'utf8');
	} catch {
		return;
	}

	const lines = reference.split(/\r?\n/);
	const lineCount =
		reference.length === 0
			? 0
			: (reference.match(/\n/g)?.length ?? 0) + (reference.endsWith('\n') ? 0 : 1);

	if (
		lineCount <= maxLines ||
		lines.slice(0, 20).some((referenceLine) => TABLE_OF_CONTENTS_LINK.test(referenceLine))
	) {
		return;
	}

	issues.push({
		line,
		message: `Reference "${url}" has ${lineCount} lines; add a table of contents near the top.`,
	});
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

	return DEFAULT_MAX_REFERENCE_LINES;
}

if (import.meta.vitest) {
	test('reports a long referenced Markdown file without a table of contents', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'references/guide.md': Array(101).fill('content').join('\n'),
		});

		expect(
			validateReferenceTablesOfContents(
				fixture.getPath('SKILL.md'),
				'Read [the guide](references/guide.md).\n',
			),
		).toEqual([
			{
				line: 1,
				message:
					'Reference "references/guide.md" has 101 lines; add a table of contents near the top.',
			},
		]);
	});

	test('accepts a long reference with a linked table of contents near the top', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'references/guide.md': [
				'# Guide',
				'',
				'- [Usage](#usage)',
				'',
				'## Usage',
				...Array.from({ length: 96 }, () => 'content'),
			].join('\n'),
		});

		expect(
			validateReferenceTablesOfContents(
				fixture.getPath('SKILL.md'),
				'Read [the guide](references/guide.md).\n',
			),
		).toEqual([]);
	});

	test('accepts a reference at the configured line threshold', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'references/guide.md': ['one', 'two'].join('\n'),
		});

		expect(
			validateReferenceTablesOfContents(
				fixture.getPath('SKILL.md'),
				'Read [the guide](references/guide.md).\n',
				{ maxLines: 2 },
			),
		).toEqual([]);
	});

	test('does not count a trailing newline as an extra line', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'references/guide.md': `${Array(100).fill('content').join('\n')}\n`,
		});

		expect(
			validateReferenceTablesOfContents(
				fixture.getPath('SKILL.md'),
				'Read [the guide](references/guide.md).\n',
			),
		).toEqual([]);
	});

	test('uses a configured line threshold', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'references/guide.txt': ['one', 'two', 'three'].join('\n'),
		});

		expect(
			validateReferenceTablesOfContents(
				fixture.getPath('SKILL.md'),
				'Read [the guide](references/guide.txt).\n',
				{ maxLines: 2 },
			),
		).toHaveLength(1);
	});

	test('ignores missing references and non-text assets', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture();

		expect(
			validateReferenceTablesOfContents(
				fixture.getPath('SKILL.md'),
				'[missing](references/missing.md) ![image](assets/image.png)\n',
			),
		).toEqual([]);
	});
}
