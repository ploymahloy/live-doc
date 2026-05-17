import type { Editor } from '@tiptap/core';

export function getEditorHtml(editor: Editor): string {
	return editor.getHTML();
}

export function normalizeHtml(html: string): string {
	return html.replace(/\s+/g, ' ').trim();
}

export function expectEditorHtmlEqual(editorA: Editor, editorB: Editor): void {
	const htmlA = normalizeHtml(getEditorHtml(editorA));
	const htmlB = normalizeHtml(getEditorHtml(editorB));
	if (htmlA !== htmlB) {
		throw new Error(`Editor HTML mismatch:\nA: ${htmlA}\nB: ${htmlB}`);
	}
}

export function expectEditorHtml(editor: Editor, expected: string): void {
	const actual = normalizeHtml(getEditorHtml(editor));
	const normalizedExpected = normalizeHtml(expected);
	if (actual !== normalizedExpected) {
		throw new Error(`Expected HTML:\n${normalizedExpected}\nActual:\n${actual}`);
	}
}
