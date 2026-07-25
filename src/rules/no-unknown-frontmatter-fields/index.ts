/**
 * Implements `skills/no-unknown-frontmatter-fields`.
 *
 * The Agent Skills reference validator (`skills-ref`) rejects any frontmatter
 * field outside the specified set, catching typos such as `descriptions:` that
 * an agent would silently ignore. This rule's default preset is more lenient
 * than that validator: it accepts the portable Agent Skills specification
 * fields plus Claude Code's documented frontmatter extensions, so enabling
 * this opt-in rule does not force a repository to drop fields Claude Code
 * already understands (`disable-model-invocation`, `paths`, and so on).
 *
 * Repositories with additional host-specific or custom top-level fields can
 * allow them explicitly with the `additionalFields` option instead of
 * disabling the rule. Only the top-level keys are checked; `metadata` remains
 * the open extension point for arbitrary custom data. The rule stays silent
 * when frontmatter is missing or invalid, leaving that to
 * `skills/valid-frontmatter`.
 *
 * @see https://github.com/agentskills/agentskills/tree/main/skills-ref
 * @see https://agentskills.io/specification
 * @see https://code.claude.com/docs/en/skills
 */
import { createSkillRule } from '../../core/rule.ts';
import { parseFrontmatter } from '../valid-frontmatter/index.ts';

export interface UnknownFieldIssue {
	line: number;
	message: string;
}

/** Top-level frontmatter fields defined by the Agent Skills specification. */
export const AGENT_SKILLS_FRONTMATTER_FIELDS = [
	'allowed-tools',
	'compatibility',
	'description',
	'license',
	'metadata',
	'name',
] as const satisfies readonly string[];

/**
 * Claude Code's documented extensions to the Agent Skills frontmatter.
 * @see https://code.claude.com/docs/en/skills
 */
export const CLAUDE_CODE_FRONTMATTER_FIELDS = [
	'agent',
	'argument-hint',
	'arguments',
	'context',
	'disable-model-invocation',
	'disallowed-tools',
	'effort',
	'hooks',
	'model',
	'paths',
	'shell',
	'user-invocable',
	'when_to_use',
] as const satisfies readonly string[];

/**
 * Default known frontmatter fields: the Agent Skills specification plus
 * Claude Code's documented extensions.
 */
export const DEFAULT_ALLOWED_FRONTMATTER_FIELDS: ReadonlySet<string> = new Set([
	...AGENT_SKILLS_FRONTMATTER_FIELDS,
	...CLAUDE_CODE_FRONTMATTER_FIELDS,
]);

/**
 * Oxlint rule that rejects frontmatter fields outside the specification and
 * its known host extensions.
 *
 * Opt-in: excluded from the recommended preset because this plugin otherwise
 * permits arbitrary extension fields.
 */
export const noUnknownFrontmatterFieldsRule = createSkillRule(
	"Reject SKILL.md frontmatter fields outside the Agent Skills specification and this rule's known host extensions.",
	(_filePath, source, option) => validateKnownFields(source, readAdditionalFields(option)),
	{ recommended: false },
);

export function validateKnownFields(
	source: string,
	additionalFields: readonly string[] = [],
): UnknownFieldIssue[] {
	const parsed = parseFrontmatter(source);

	// Missing/invalid frontmatter is reported by valid-frontmatter.
	if (parsed.data === undefined) {
		return [];
	}

	const allowedFields = new Set(DEFAULT_ALLOWED_FRONTMATTER_FIELDS);
	for (const field of additionalFields) {
		allowedFields.add(field);
	}

	const issues: UnknownFieldIssue[] = [];

	// Report each unknown key in document order at its own line.
	for (const key of Object.keys(parsed.data)) {
		if (allowedFields.has(key)) {
			continue;
		}

		const keyLineIndex = parsed.lines.findIndex((line) => line.startsWith(`${key}:`));

		issues.push({
			line: keyLineIndex === -1 ? 1 : keyLineIndex + 1,
			message: `Frontmatter field "${key}" is not part of the Agent Skills specification or its known extensions; remove it, move it under metadata, or allow it via additionalFields.`,
		});
	}

	return issues;
}

function readAdditionalFields(option: unknown): readonly string[] {
	if (
		typeof option === 'object' &&
		option !== null &&
		'additionalFields' in option &&
		Array.isArray(option.additionalFields) &&
		option.additionalFields.every((field) => typeof field === 'string')
	) {
		return option.additionalFields;
	}

	return [];
}

if (import.meta.vitest) {
	test('accepts only specified fields', () => {
		expect(
			validateKnownFields(
				'---\nname: clean-fields\ndescription: Uses only specified fields.\nlicense: MIT\nmetadata:\n  author: example\n---\n\n# Clean Fields\n',
			),
		).toEqual([]);
	});

	test('reports an unknown field at its line', () => {
		expect(
			validateKnownFields(
				'---\nname: typo-field\ndescription: Has a typo.\ndescriptions: typo\n---\n',
			),
		).toEqual([
			{
				line: 4,
				message:
					'Frontmatter field "descriptions" is not part of the Agent Skills specification or its known extensions; remove it, move it under metadata, or allow it via additionalFields.',
			},
		]);
	});

	test('accepts Claude Code frontmatter extensions by default', () => {
		expect(
			validateKnownFields(
				'---\nname: deploy\ndescription: Deploys the app.\ndisable-model-invocation: true\npaths: ["**/*.ts"]\n---\n',
			),
		).toEqual([]);
	});

	test('rejects a field outside the preset by default', () => {
		expect(
			validateKnownFields(
				'---\nname: custom-field\ndescription: Has a custom field.\nglobs: "*.ts"\n---\n',
			),
		).toEqual([
			{
				line: 4,
				message:
					'Frontmatter field "globs" is not part of the Agent Skills specification or its known extensions; remove it, move it under metadata, or allow it via additionalFields.',
			},
		]);
	});

	test('accepts a field allowed via additionalFields', () => {
		expect(
			validateKnownFields(
				'---\nname: custom-field\ndescription: Has a custom field.\nglobs: "*.ts"\n---\n',
				['globs'],
			),
		).toEqual([]);
	});

	test('stays silent when frontmatter is invalid', () => {
		expect(validateKnownFields('# No frontmatter here\n')).toEqual([]);
	});
}
