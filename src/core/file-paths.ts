import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

export function escapesDirectory(directory: string, target: string): boolean {
	const path = relative(directory, target);
	return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
}

export function targetExists(target: string): boolean {
	try {
		const stats = statSync(target);
		return stats.isFile() || stats.isDirectory();
	} catch {
		return false;
	}
}

export function isPathInsideDirectory(directory: string, target: string): boolean {
	try {
		return targetExists(target) && !escapesDirectory(realpathSync(directory), realpathSync(target));
	} catch {
		return false;
	}
}
