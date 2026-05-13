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
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';

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

function EditorWithYDoc({ ydoc }: { ydoc: Y.Doc }) {
	const [yUpdateCount, setYUpdateCount] = useState(0);
	const [encodedStateBytes, setEncodedStateBytes] = useState(0);
	const [prosemirrorJsonText, setProsemirrorJsonText] = useState('');

	const editor = useEditor({
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

	useEffect(() => {
		if (!editor) {
			return;
		}

		const fragment = ydoc.getXmlFragment(COLLAB_FIELD);

		const onYDocUpdate = () => {
			setYUpdateCount(n => n + 1);
			setEncodedStateBytes(Y.encodeStateAsUpdate(ydoc).byteLength);
			try {
				const root = yXmlFragmentToProseMirrorRootNode(fragment, editor.schema);
				setProsemirrorJsonText(JSON.stringify(root.toJSON(), null, 2));
			} catch {
				setProsemirrorJsonText('');
			}
		};

		ydoc.on('update', onYDocUpdate);
		onYDocUpdate();

		return () => {
			ydoc.off('update', onYDocUpdate);
		};
	}, [editor, ydoc]);

	if (!editor) {
		return null;
	}

	return (
		<div className='space-y-3'>
			<dl className='grid gap-1 rounded-md border border-neutral-900/10 bg-neutral-900/4 px-3 py-2 font-mono text-xs text-neutral-700 sm:grid-cols-[auto_1fr] sm:gap-x-4'>
				<dt className='text-neutral-500'>Y.Doc updates</dt>
				<dd>{yUpdateCount}</dd>
				<dt className='text-neutral-500'>encodeStateAsUpdate bytes</dt>
				<dd>{encodedStateBytes}</dd>
			</dl>

			<EditorContent className={editorContentClassName} editor={editor} />

			<details className='rounded-md border border-neutral-900/10 bg-neutral-900/4'>
				<summary className='cursor-pointer px-3 py-2 font-mono text-xs text-neutral-600'>
					Y.XmlFragment → ProseMirror JSON (live)
				</summary>
				<pre className='max-h-48 overflow-auto border-t border-neutral-900/10 p-3 font-mono text-[11px] leading-relaxed text-neutral-800'>
					{prosemirrorJsonText}
				</pre>
			</details>
		</div>
	);
}

export function Editor() {
	const [ydoc, setYdoc] = useState<Y.Doc | null>(null);

	useEffect(() => {
		const doc = new Y.Doc();
		let cancelled = false;

		queueMicrotask(() => {
			if (!cancelled) {
				setYdoc(doc);
			}
		});

		return () => {
			cancelled = true;
			queueMicrotask(() => {
				setYdoc(null);
				doc.destroy();
			});
		};
	}, []);

	if (!ydoc) {
		return <p className='text-sm text-neutral-500'>Preparing editor…</p>;
	}

	return <EditorWithYDoc ydoc={ydoc} />;
}
