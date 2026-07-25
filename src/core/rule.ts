/**
 * Defines repository-scoped Agent Skill rules and discovers SKILL.md files.
 *
 * A rule validates either one skill at a time ({@link createSkillRule}) or all
 * discovered skills together ({@link createAggregateSkillRule}, for checks
 * that depend on more than one SKILL.md, such as duplicate names). Every rule
 * exposes a plain `check(skills, option)` function so the lint engine in
 * `core/lint.ts` can run it directly, without a host linter in between.
 *
 * Rule options accept `{ roots: string[] }`. When omitted, rules scan the
 * standard Agent Skill locations `.agent/skills`, `.agents/skills`,
 * `.claude/skills`, `agents/skills`, and `skills`, relative to the lint run's
 * working directory.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export interface SkillIssue {
	line: number;
	message: string;
}

export interface DiscoveredSkill {
	displayPath: string;
	filePath: string;
	source: string;
}

export interface AggregateSkillIssue {
	filePath: string;
	line: number;
	message: string;
}

export type SkillValidator<Options = unknown> = (
	filePath: string,
	source: string,
	option: Options | undefined,
) => SkillIssue | readonly SkillIssue[] | undefined;

export type AggregateSkillValidator<Options = unknown> = (
	skills: readonly DiscoveredSkill[],
	option: Options | undefined,
) => readonly AggregateSkillIssue[];

export interface RuleModule<Options = unknown> {
	description: string;
	recommended: boolean;
	check: AggregateSkillValidator<Options>;
}

export interface CreateRuleOptions {
	recommended?: boolean;
}

export const DEFAULT_SKILL_ROOTS = [
	'.agent/skills',
	'.agents/skills',
	'.claude/skills',
	'agents/skills',
	'skills',
] as const;

/**
 * Creates a rule that validates each SKILL.md independently.
 *
 * Pass `{ recommended: false }` for opt-in rules that should stay out of the
 * recommended preset (for example, stricter checks that diverge from this
 * plugin's default leniency).
 */
export function createSkillRule<Options = unknown>(
	description: string,
	validate: SkillValidator<Options>,
	{ recommended = true }: CreateRuleOptions = {},
): RuleModule<Options> {
	return {
		check(skills, option) {
			const issues: AggregateSkillIssue[] = [];

			for (const skill of skills) {
				const result = validate(skill.filePath, skill.source, option);
				const found: readonly SkillIssue[] =
					result === undefined ? [] : Array.isArray(result) ? result : [result];

				for (const issue of found) {
					issues.push({ filePath: skill.filePath, line: issue.line, message: issue.message });
				}
			}

			return issues;
		},
		description,
		recommended,
	};
}

/**
 * Creates a rule that validates all discovered skills together, enabling
 * checks that depend on more than one SKILL.md.
 */
export function createAggregateSkillRule<Options = unknown>(
	description: string,
	validate: AggregateSkillValidator<Options>,
	{ recommended = true }: CreateRuleOptions = {},
): RuleModule<Options> {
	return { check: validate, description, recommended };
}

export function discoverSkillFiles(
	cwd: string,
	roots: readonly string[] = DEFAULT_SKILL_ROOTS,
): string[] {
	const skillFiles: string[] = [];
	const visitedDirectories = new Set<string>();
	const visitedFiles = new Set<string>();

	for (const root of roots) {
		visitDirectory(resolve(cwd, root), skillFiles, visitedDirectories, visitedFiles);
	}

	return skillFiles.toSorted();
}

export function discoverSkills(
	cwd: string,
	roots: readonly string[] = DEFAULT_SKILL_ROOTS,
): DiscoveredSkill[] {
	return discoverSkillFiles(cwd, roots).map((filePath) => ({
		displayPath: displayPath(cwd, filePath),
		filePath,
		source: readFileSync(filePath, 'utf8'),
	}));
}

export function readRoots(option: unknown): readonly string[] | undefined {
	if (
		typeof option === 'object' &&
		option !== null &&
		'roots' in option &&
		Array.isArray(option.roots) &&
		option.roots.every((root) => typeof root === 'string')
	) {
		return option.roots;
	}

	return undefined;
}

export function displayPath(cwd: string, filePath: string): string {
	return relative(cwd, filePath).split(sep).join('/');
}

function visitDirectory(
	directory: string,
	skillFiles: string[],
	visitedDirectories: Set<string>,
	visitedFiles: Set<string>,
): void {
	let entries;
	let realDirectory;

	try {
		realDirectory = realpathSync(directory);

		if (visitedDirectories.has(realDirectory)) {
			return;
		}

		visitedDirectories.add(realDirectory);
		entries = readdirSync(directory, { withFileTypes: true });
	} catch (error) {
		if (isMissingDirectoryError(error)) {
			return;
		}

		throw error;
	}

	for (const entry of entries) {
		const path = join(directory, entry.name);
		let isDirectory = entry.isDirectory();
		let isFile = entry.isFile();

		if (entry.isSymbolicLink()) {
			try {
				const target = statSync(path);
				isDirectory = target.isDirectory();
				isFile = target.isFile();
			} catch (error) {
				if (isMissingDirectoryError(error)) {
					continue;
				}

				throw error;
			}
		}

		if (isDirectory) {
			visitDirectory(path, skillFiles, visitedDirectories, visitedFiles);
		} else if (isFile && entry.name === 'SKILL.md') {
			const realFile = realpathSync(path);

			if (!visitedFiles.has(realFile)) {
				visitedFiles.add(realFile);
				skillFiles.push(path);
			}
		}
	}
}

function isMissingDirectoryError(error: unknown): boolean {
	return (
		error instanceof Error &&
		'code' in error &&
		(error.code === 'ENOENT' || error.code === 'ENOTDIR')
	);
}

if (import.meta.vitest) {
	test('finds SKILL.md files in the standard skill roots', async () => {
		const { fileURLToPath } = await import('node:url');
		const cwd = fileURLToPath(new URL('./__fixture__/discovery', import.meta.url));

		expect(discoverSkillFiles(cwd)).toEqual([
			join(cwd, '.agent/skills/formatting/SKILL.md'),
			join(cwd, '.agents/skills/commit/SKILL.md'),
			join(cwd, '.claude/skills/deploy/SKILL.md'),
			join(cwd, 'agents/skills/testing/SKILL.md'),
		]);
	});

	test('follows symlinked skill directories', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.agents/skills/example': (ctx) => ctx.symlink(ctx.getPath('shared/example')),
			'shared/example/SKILL.md': '# Example\n',
		});

		expect(discoverSkillFiles(fixture.path)).toEqual([
			fixture.getPath('.agents/skills/example/SKILL.md'),
		]);
	});

	test('deduplicates files discovered through overlapping roots', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'skills/example/SKILL.md': '# Example\n',
		});

		expect(discoverSkillFiles(fixture.path, ['skills', 'skills/example'])).toEqual([
			fixture.getPath('skills/example/SKILL.md'),
		]);
	});

	test('does not recurse forever through symlink cycles', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'skills/example/cycle': (ctx) => ctx.symlink(ctx.getPath('skills')),
			'skills/example/SKILL.md': '# Example\n',
		});

		expect(discoverSkillFiles(fixture.path, ['skills'])).toEqual([
			fixture.getPath('skills/example/SKILL.md'),
		]);
	});

	test('ignores broken symlinks while scanning skills', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'skills/broken': (ctx) => ctx.symlink(ctx.getPath('missing')),
		});

		expect(discoverSkillFiles(fixture.path, ['skills'])).toEqual([]);
	});
}
