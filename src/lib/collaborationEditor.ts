import Bold from '@tiptap/extension-bold';
import CodeBlock from '@tiptap/extension-code-block';
import Collaboration from '@tiptap/extension-collaboration';
import Document from '@tiptap/extension-document';
import Heading from '@tiptap/extension-heading';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import type { Extensions } from '@tiptap/core';
import * as Y from 'yjs';

export const COLLAB_FIELD = 'default';

export const INITIAL_COLLABORATION_HTML = `<h1>Live doc</h1>
<p>This editor uses <strong>bold</strong>, <em>italic</em>, headings, and code blocks.</p>
<pre><code>npm install @tiptap/react</code></pre>`;

export function getCollaborationEditorExtensions(ydoc: Y.Doc): Extensions {
	return [
		Document,
		Paragraph,
		Text,
		Bold,
		Italic,
		Heading.configure({ levels: [1, 2, 3] }),
		CodeBlock,
		Collaboration.configure({
			document: ydoc,
			field: COLLAB_FIELD
		})
	];
}

export function seedCollaborationFragmentIfEmpty(ydoc: Y.Doc, setContent: (html: string) => void): void {
	const fragment = ydoc.getXmlFragment(COLLAB_FIELD);
	if (fragment.length === 0) {
		setContent(INITIAL_COLLABORATION_HTML);
	}
}
