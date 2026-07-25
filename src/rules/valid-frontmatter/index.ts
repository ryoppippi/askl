/**
 * Implements `skills/valid-frontmatter`.
 *
 * Agent Skills use YAML frontmatter as their discovery contract. This rule
 * parses that frontmatter with a YAML parser and validates the portable fields
 * defined by the Agent Skills specification:
 *
 * - the document starts and ends its frontmatter with `---`;
 * - the YAML document is a mapping;
 * - `name` and `description` are present and have valid values;
 * - names use Unicode lowercase letters, numbers, and single hyphens;
 * - names avoid the reserved `anthropic` and `claude` terms;
 * - optional `license`, `compatibility`, `metadata`, and `allowed-tools`
 *   values use their specified types and limits;
 * - names and descriptions do not contain XML tags.
 *
 * Unknown extension fields remain valid so tools can add metadata such as
 * Claude Code's `paths` field without making the skill incompatible with this
 * plugin.
 * Parser locations are translated from frontmatter-relative positions to
 * actual SKILL.md lines before diagnostics are reported.
 *
 * @see https://agentskills.io/specification
 * @see https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
 */
import { parseDocument } from 'yaml';

import { createSkillRule } from '../../core/rule.ts';

export type FrontmatterIssueCode =
	| 'invalid-allowed-tools'
	| 'invalid-compatibility'
	| 'invalid-description'
	| 'invalid-frontmatter'
	| 'invalid-license'
	| 'invalid-metadata'
	| 'invalid-metadata-value'
	| 'invalid-name'
	| 'missing-description'
	| 'missing-frontmatter'
	| 'missing-name'
	| 'reserved-name'
	| 'unclosed-frontmatter';

export interface FrontmatterIssue {
	code: FrontmatterIssueCode;
	line: number;
	message: string;
}

export interface ParsedFrontmatter {
	data?: Record<string, unknown>;
	issues: FrontmatterIssue[];
	lines: readonly string[];
}

type Frontmatter = Record<string, unknown>;

// The Agent Skills specification and the reference `skills-ref` validator allow
// Unicode lowercase alphanumeric names, not just ASCII. Each hyphen-separated
// segment must be one or more lowercase letters (`\p{Ll}`), caseless letters
// from scripts without case such as CJK or Hiragana (`\p{Lo}`), modifier
// letters (`\p{Lm}`), or decimal digits (`\p{Nd}`). Non-empty segments joined
// by single hyphens forbid leading, trailing, and consecutive hyphens, while
// excluding `\p{Lu}`/`\p{Lt}` keeps uppercase names invalid.
const NAME_PATTERN = /^[\p{Ll}\p{Lo}\p{Lm}\p{Nd}]+(?:-[\p{Ll}\p{Lo}\p{Lm}\p{Nd}]+)*$/u;
const XML_TAG_PATTERN = /<[^>]+>/;

/**
 * Oxlint rule that validates the YAML discovery metadata in every SKILL.md
 * found under the configured skill roots.
 */
export const validFrontmatterRule = createSkillRule(
	'Validate Agent Skill YAML frontmatter.',
	(_filePath, source) => validateFrontmatter(source),
);

export function validateFrontmatter(source: string): FrontmatterIssue[] {
	const parsed = parseFrontmatter(source);

	if (parsed.data === undefined) {
		return parsed.issues;
	}

	return [...parsed.issues, ...validateFields(parsed.data, parsed.lines)];
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
	const lines = source.split(/\r?\n/);

	if (lines[0] !== '---') {
		return {
			issues: [issue('missing-frontmatter', 1, 'SKILL.md must start with YAML frontmatter.')],
			lines,
		};
	}

	const closingLineIndex = lines.findIndex((line, index) => index > 0 && line === '---');

	if (closingLineIndex === -1) {
		return {
			issues: [issue('unclosed-frontmatter', 1, 'YAML frontmatter must end with a --- delimiter.')],
			lines,
		};
	}

	const document = parseDocument(lines.slice(1, closingLineIndex).join('\n'));

	if (document.errors.length > 0) {
		return {
			issues: [
				issue(
					'invalid-frontmatter',
					(document.errors[0]?.linePos?.[0].line ?? 0) + 1,
					'YAML frontmatter must be valid.',
				),
			],
			lines,
		};
	}

	const frontmatter: unknown = document.toJS();

	if (!isRecord(frontmatter)) {
		return {
			issues: [issue('invalid-frontmatter', 1, 'YAML frontmatter must be a key-value mapping.')],
			lines,
		};
	}

	return {
		data: frontmatter,
		issues: [],
		lines,
	};
}

function validateFields(frontmatter: Frontmatter, lines: readonly string[]): FrontmatterIssue[] {
	const issues: FrontmatterIssue[] = [];
	const name = frontmatter.name;
	const description = frontmatter.description;

	if (name === undefined) {
		issues.push(issue('missing-name', 1, 'Frontmatter requires a name field.'));
	} else if (
		typeof name !== 'string' ||
		name.length === 0 ||
		name.length > 64 ||
		!NAME_PATTERN.test(name) ||
		XML_TAG_PATTERN.test(name)
	) {
		issues.push(
			issue(
				'invalid-name',
				findFieldLine(lines, 'name'),
				'Name must be 1-64 lowercase letters, numbers, or single hyphens.',
			),
		);
	} else if (name.includes('anthropic') || name.includes('claude')) {
		issues.push(
			issue(
				'reserved-name',
				findFieldLine(lines, 'name'),
				'Name must not contain the reserved words anthropic or claude.',
			),
		);
	}

	if (description === undefined) {
		issues.push(issue('missing-description', 1, 'Frontmatter requires a description field.'));
	} else if (
		typeof description !== 'string' ||
		description.length === 0 ||
		description.length > 1024 ||
		XML_TAG_PATTERN.test(description)
	) {
		issues.push(
			issue(
				'invalid-description',
				findFieldLine(lines, 'description'),
				'Description must be a non-empty string of at most 1024 characters without XML tags.',
			),
		);
	}

	validateStringField(frontmatter, lines, 'license', 0, 'invalid-license', issues);
	validateStringField(frontmatter, lines, 'compatibility', 500, 'invalid-compatibility', issues);
	validateMetadata(frontmatter, lines, issues);
	validateStringField(frontmatter, lines, 'allowed-tools', 0, 'invalid-allowed-tools', issues);

	return issues;
}

function validateStringField(
	frontmatter: Frontmatter,
	lines: readonly string[],
	field: string,
	maxLength: number,
	code: 'invalid-allowed-tools' | 'invalid-compatibility' | 'invalid-license',
	issues: FrontmatterIssue[],
): void {
	const value = frontmatter[field];

	if (
		value !== undefined &&
		(typeof value !== 'string' || value.length === 0 || (maxLength > 0 && value.length > maxLength))
	) {
		issues.push(
			issue(
				code,
				findFieldLine(lines, field),
				`${field} must be a non-empty string${maxLength > 0 ? ` of at most ${maxLength} characters` : ''}.`,
			),
		);
	}
}

function validateMetadata(
	frontmatter: Frontmatter,
	lines: readonly string[],
	issues: FrontmatterIssue[],
): void {
	const metadata = frontmatter.metadata;

	if (metadata === undefined) {
		return;
	}

	if (!isRecord(metadata)) {
		issues.push(
			issue(
				'invalid-metadata',
				findFieldLine(lines, 'metadata'),
				'metadata must be a key-value mapping.',
			),
		);
		return;
	}

	if (Object.values(metadata).some((value) => typeof value !== 'string')) {
		issues.push(
			issue(
				'invalid-metadata-value',
				findFieldLine(lines, 'metadata'),
				'metadata values must be strings.',
			),
		);
	}
}

function findFieldLine(lines: readonly string[], field: string): number {
	const index = lines.findIndex((line) => line.startsWith(`${field}:`));
	return index === -1 ? 1 : index + 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(code: FrontmatterIssueCode, line: number, message: string): FrontmatterIssue {
	return { code, line, message };
}

if (import.meta.vitest) {
	test('accepts valid Agent Skill frontmatter', () => {
		const issues = validateFrontmatter(
			'---\nname: reviewing-code\ndescription: Reviews code. Use when inspecting changes.\nlicense: MIT\ncompatibility: Requires git.\nmetadata:\n  author: example\nallowed-tools: Read Bash(git:*)\n---\n\n# Reviewing Code\n',
		);

		expect(issues).toEqual([]);
	});

	test('requires a closed YAML frontmatter block', () => {
		const issues = validateFrontmatter('---\nname: reviewing-code\ndescription: Reviews code.\n');

		expect(issues.map(({ code, line }) => ({ code, line }))).toEqual([
			{ code: 'unclosed-frontmatter', line: 1 },
		]);
	});

	test('reports invalid YAML at its SKILL.md line', () => {
		const issues = validateFrontmatter('---\nname: reviewing-code\ndescription: [\n---\n');

		expect(issues.map(({ code, line }) => ({ code, line }))).toEqual([
			{ code: 'invalid-frontmatter', line: 3 },
		]);
	});

	test('requires name and description fields', () => {
		const issues = validateFrontmatter('---\nlicense: MIT\n---\n');

		expect(issues.map(({ code }) => code)).toEqual(['missing-name', 'missing-description']);
	});

	test.each([
		['Reviewing-Code', 'invalid-name'],
		['-reviewing-code', 'invalid-name'],
		['reviewing--code', 'invalid-name'],
		['claude-reviewing', 'reserved-name'],
	])('rejects the name %s', (name, expectedCode) => {
		const issues = validateFrontmatter(
			`---\nname: ${name}\ndescription: Reviews code. Use when inspecting changes.\n---\n`,
		);

		expect(issues.map(({ code }) => code)).toContain(expectedCode);
	});

	test.each(['数据分析', 'café-processing', 'обработка'])(
		'accepts the Unicode lowercase name %s',
		(name) => {
			const issues = validateFrontmatter(
				`---\nname: ${name}\ndescription: Does the thing. Use when the thing is needed.\n---\n\n# Body\n`,
			);

			expect(issues).toEqual([]);
		},
	);

	test('validates optional field types', () => {
		const issues = validateFrontmatter(
			'---\nname: reviewing-code\ndescription: Reviews code.\nlicense:\n  kind: MIT\ncompatibility: 42\nmetadata:\n  version: 1\nallowed-tools:\n  - Read\n---\n',
		);

		expect(issues.map(({ code }) => code)).toEqual([
			'invalid-license',
			'invalid-compatibility',
			'invalid-metadata-value',
			'invalid-allowed-tools',
		]);
	});
}
