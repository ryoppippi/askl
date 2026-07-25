import { fromMarkdown } from 'mdast-util-from-markdown';

export type MarkdownReferenceKind = 'definition' | 'image' | 'link';

export interface LocalMarkdownReference {
	kind: MarkdownReferenceKind;
	line: number;
	path: string;
	url: string;
}

interface MarkdownNode {
	children?: unknown;
	position?: {
		start?: {
			line?: unknown;
		};
	};
	type?: unknown;
	url?: unknown;
}

export function collectLocalMarkdownReferences(source: string): LocalMarkdownReference[] {
	const references: LocalMarkdownReference[] = [];
	visitNode(fromMarkdown(source), references);
	return references;
}

function visitNode(node: unknown, references: LocalMarkdownReference[]): void {
	if (!isMarkdownNode(node)) {
		return;
	}

	if (isReferenceKind(node.type) && typeof node.url === 'string') {
		const path = relativeReferencePath(node.url);

		if (path !== undefined) {
			references.push({
				kind: node.type,
				line: typeof node.position?.start?.line === 'number' ? node.position.start.line : 1,
				path,
				url: node.url,
			});
		}
	}

	if (Array.isArray(node.children)) {
		for (const child of node.children) {
			visitNode(child, references);
		}
	}
}

function relativeReferencePath(url: string): string | undefined {
	if (
		url.length === 0 ||
		url.startsWith('#') ||
		url.startsWith('/') ||
		url.startsWith('//') ||
		/^[a-z][a-z\d+.-]*:/i.test(url)
	) {
		return undefined;
	}

	const path = url.split(/[?#]/, 1)[0] ?? '';

	try {
		return decodeURI(path);
	} catch {
		return path;
	}
}

function isReferenceKind(value: unknown): value is MarkdownReferenceKind {
	return value === 'definition' || value === 'image' || value === 'link';
}

function isMarkdownNode(value: unknown): value is MarkdownNode {
	return typeof value === 'object' && value !== null;
}
