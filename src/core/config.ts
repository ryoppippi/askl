/**
 * Loads askl's JSONC config file.
 *
 * The config only ever sets defaults: `roots` and each rule's severity/options
 * merge with the CLI's `--roots` and `--rule` flags, which take precedence
 * because they are more specific to a single invocation.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser';

import type { ParseError } from 'jsonc-parser';
import type { RuleSeverityConfig } from './lint.ts';

export const CONFIG_FILE_NAMES = ['.asklrc.jsonc', '.asklrc.json'] as const;

export interface AsklConfig {
	roots?: readonly string[];
	rules?: Readonly<Record<string, RuleSeverityConfig>>;
}

export class ConfigError extends Error {}

/** Searches upward from `cwd` for the nearest config file, stopping at the filesystem root. */
export function findConfigFile(cwd: string): string | undefined {
	let directory = cwd;

	for (;;) {
		for (const name of CONFIG_FILE_NAMES) {
			const candidate = join(directory, name);

			if (existsSync(candidate)) {
				return candidate;
			}
		}

		const parent = dirname(directory);

		if (parent === directory) {
			return undefined;
		}

		directory = parent;
	}
}

export function loadConfig(path: string): AsklConfig {
	const source = readFileSync(path, 'utf8');
	const errors: ParseError[] = [];
	const data: unknown = parseJsonc(source, errors, { allowTrailingComma: true });

	if (errors.length > 0) {
		const [firstError] = errors as [ParseError];
		throw new ConfigError(
			`${path}: ${printParseErrorCode(firstError.error)} at offset ${firstError.offset}.`,
		);
	}

	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		throw new ConfigError(`${path} must contain a JSON object.`);
	}

	const config = data as Record<string, unknown>;

	if (config.roots !== undefined && !isStringArray(config.roots)) {
		throw new ConfigError(`${path}: "roots" must be an array of strings.`);
	}

	if (config.rules !== undefined && !isPlainObject(config.rules)) {
		throw new ConfigError(`${path}: "rules" must be an object.`);
	}

	return config as AsklConfig;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

if (import.meta.vitest) {
	test('finds the nearest config file walking up from cwd', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.asklrc.jsonc': '{}',
			'nested/deep': {},
		});

		expect(findConfigFile(fixture.getPath('nested/deep'))).toBe(fixture.getPath('.asklrc.jsonc'));
	});

	test('returns undefined when no config file exists', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({ empty: {} });

		expect(findConfigFile(fixture.getPath('empty'))).toBeUndefined();
	});

	test('parses JSON with comments and trailing commas', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'.asklrc.jsonc': [
				'{',
				'  // prefer a tight budget',
				'  "roots": ["skills"],',
				'  "rules": { "skill-index-budget": ["warn", { "maxCharacters": 8000 }], },',
				'}',
			].join('\n'),
		});

		expect(loadConfig(fixture.getPath('.asklrc.jsonc'))).toEqual({
			roots: ['skills'],
			rules: { 'skill-index-budget': ['warn', { maxCharacters: 8000 }] },
		});
	});

	test('rejects invalid JSON', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({ '.asklrc.jsonc': '{ not json' });

		expect(() => loadConfig(fixture.getPath('.asklrc.jsonc'))).toThrow(ConfigError);
	});

	test('rejects a non-object config', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({ '.asklrc.jsonc': '[]' });

		expect(() => loadConfig(fixture.getPath('.asklrc.jsonc'))).toThrow(ConfigError);
	});

	test('rejects a non-array roots field', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({ '.asklrc.jsonc': '{ "roots": "skills" }' });

		expect(() => loadConfig(fixture.getPath('.asklrc.jsonc'))).toThrow(ConfigError);
	});
}
