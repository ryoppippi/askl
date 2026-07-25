#!/usr/bin/env bun
import { cli, define } from 'gunshi';

import packageJson from '../../package.json' with { type: 'json' };
import { formatRuleList } from './list-rules.ts';
import { REPORTER_FORMATS } from './reporters.ts';
import { run } from './run.ts';

const command = define({
	args: {
		config: {
			description: 'Path to a config file (default: nearest .asklrc.jsonc or .asklrc.json)',
			short: 'c',
			type: 'string',
		},
		'deny-warnings': {
			description: 'Exit with a non-zero status when only warnings are found',
			type: 'boolean',
		},
		format: {
			choices: REPORTER_FORMATS,
			default: 'pretty',
			description: `Output format (${REPORTER_FORMATS.join(', ')})`,
			short: 'f',
			type: 'enum',
		},
		'list-rules': {
			description: 'Print every registered rule and exit',
			type: 'boolean',
		},
		roots: {
			description:
				'Skill root directory to scan (repeatable; default: .agent/skills, .agents/skills, .claude/skills, agents/skills, skills)',
			multiple: true,
			short: 'r',
			type: 'string',
		},
		rule: {
			description: 'Override a rule severity, e.g. --rule no-empty-skill-body=off',
			multiple: true,
			type: 'string',
		},
	},
	description: 'Lint Agent Skills against the specification and authoring conventions.',
	name: 'askl',
	run: (ctx) => {
		if (ctx.values['list-rules']) {
			process.stdout.write(formatRuleList());
			return;
		}

		const result = run({
			cwd: process.cwd(),
			denyWarnings: ctx.values['deny-warnings'] ?? false,
			reporter: ctx.values.format,
			roots: ctx.values.roots ?? [],
			ruleOverrides: ctx.values.rule ?? [],
			...(ctx.values.config === undefined ? {} : { configPath: ctx.values.config }),
		});

		process.stdout.write(result.output);
		process.exitCode = result.exitCode;
	},
});

await cli(process.argv.slice(2), command, {
	description: packageJson.description,
	name: 'askl',
	// A banner before every run's stdout would break the json/unix/github
	// reporters for CI pipelines piping this output straight into a parser.
	renderHeader: null,
	version: packageJson.version,
});
