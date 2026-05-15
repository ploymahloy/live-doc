'use client';

import Collaboration from '@tiptap/extension-collaboration';
import Bold from '@tiptap/extension-bold';
import CodeBlock from '@tiptap/extension-code-block';
import Document from '@tiptap/extension-document';
import Heading from '@tiptap/extension-heading';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { EditorContent, useEditor } from '@tiptap/react';
import * as Y from 'yjs';

import { ConnectionStatusBar } from '@/components/ConnectionStatusBar';
import { useCollaboration } from '@/hooks/useCollaboration';

const COLLAB_FIELD = 'default';

const initialContent = `<h1>Live doc</h1>
<p>This editor uses <strong>bold</strong>, <em>italic</em>, headings, and code blocks.</p>
<pre><code>npm install @tiptap/react</code></pre>`;

const editorContentClassName = [
	'min-h-48 rounded-md p-4 ring-1 ring-neutral-900/10',
	'outline-none focus:outline-none focus-visible:outline-none',
	'[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight',
	'[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight',
	'[&_h3]:mb-1.5 [&_h3]:mt-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:leading-snug',
	'[&_p]:my-2',
	'[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-neutral-900/6 [&_pre]:px-4 [&_pre]:py-3 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-relaxed',
	'[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:font-[inherit] [&_pre_code]:text-[inherit]'
].join(' ');

const editorPlaceholderShellClassName = 'min-h-48 rounded-md ring-1 ring-neutral-900/10 bg-neutral-900/4';

function EnabledEditor({ ydoc }: { ydoc: Y.Doc }) {
	// TODO: Write a test(s) to enforce this.
	// Offline is a sync concern only: never tie `editable` to WebSocket status.
	const editor = useEditor({
		editable: true,
		immediatelyRender: false,
		extensions: [
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
		],
		onCreate: ({ editor }) => {
			const fragment = ydoc.getXmlFragment(COLLAB_FIELD);
			if (fragment.length === 0) {
				editor.commands.setContent(initialContent);
			}
		}
	});

	if (!editor) {
		return (
			<div className='space-y-3 text-sm text-neutral-500'>
				<p>Starting editor…</p>
				<div className={editorPlaceholderShellClassName} aria-hidden />
			</div>
		);
	}

	return <EditorContent className={editorContentClassName} editor={editor} />;
}

export function Editor() {
	const { ydoc, ready, displayConnectionStatus } = useCollaboration();

	return (
		<div className='space-y-3'>
			<ConnectionStatusBar status={displayConnectionStatus} />

			{!ready || !ydoc ?
				<p className='text-sm text-neutral-500'>Preparing editor…</p>
			:	<EnabledEditor ydoc={ydoc} />}
		</div>
	);
}
