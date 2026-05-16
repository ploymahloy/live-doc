'use client';

import { useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Bold from '@tiptap/extension-bold';
import CodeBlock from '@tiptap/extension-code-block';
import Document from '@tiptap/extension-document';
import Heading from '@tiptap/extension-heading';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { EditorContent, useEditor } from '@tiptap/react';
import * as Y from 'yjs';

import { DocumentActiveUsersHeader } from '@/components/DocumentActiveUsersHeader';
import { EditorErrorBoundary } from '@/components/EditorErrorBoundary';
import { useCollaboration } from '@/hooks/useCollaboration';
import { useCollaborationAwarenessPeers } from '@/hooks/useCollaborationAwarenessPeers';
import { parseCollaboratorIdentityFromAwareness } from '@/lib/collaborationMetadataSchemas';
import { DEFAULT_COLLABORATOR_DISPLAY_COLOR, type CollaboratorIdentity } from '@/lib/collaboratorIdentity';
import { readableTextHexOnBackground } from '@/lib/readableTextOnBackground';

const COLLAB_FIELD = 'default';

const initialContent = `<h1>Live doc</h1>
<p>This editor uses <strong>bold</strong>, <em>italic</em>, headings, and code blocks.</p>
<pre><code>npm install @tiptap/react</code></pre>`;

const editorContentClassName = [
	'tiptap',
	'min-h-48 rounded-md p-4 ring-1 ring-neutral-900/10',
	'outline-none focus:outline-none focus-visible:outline-none',
	'[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight',
	'[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight',
	'[&_h3]:mb-1.5 [&_h3]:mt-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:leading-snug',
	'[&_p]:my-2',
	'[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-neutral-900/6 [&_pre]:px-4 [&_pre]:py-3 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-relaxed',
	'[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:font-[inherit] [&_pre_code]:text-[inherit]',
	'[&_.collab-caret]:pointer-events-none [&_.collab-caret]:relative [&_.collab-caret]:-mx-px [&_.collab-caret]:border-x [&_.collab-caret]:border-solid [&_.collab-caret]:border-neutral-900 [&_.collab-caret]:break-normal',
	'[&_.collab-caret-label]:absolute [&_.collab-caret-label]:-left-px [&_.collab-caret-label]:-top-[1.4em] [&_.collab-caret-label]:whitespace-nowrap [&_.collab-caret-label]:select-none [&_.collab-caret-label]:rounded-[3px_3px_3px_0] [&_.collab-caret-label]:text-xs [&_.collab-caret-label]:not-italic [&_.collab-caret-label]:font-semibold [&_.collab-caret-label]:leading-normal [&_.collab-caret-label]:px-[0.3rem] [&_.collab-caret-label]:py-[0.1rem]'
].join(' ');

const editorPlaceholderShellClassName = 'min-h-48 rounded-md ring-1 ring-neutral-900/10 bg-neutral-900/4';

const collaborationCaretRender = (user: Record<string, unknown>) => {
	const identity = parseCollaboratorIdentityFromAwareness(user);
	const color = identity?.color ?? DEFAULT_COLLABORATOR_DISPLAY_COLOR;
	const name = identity?.name ?? '';
	const textColor = readableTextHexOnBackground(color);

	const cursor = document.createElement('span');
	cursor.classList.add('collab-caret', 'collaboration-carets__caret');
	cursor.setAttribute('style', `border-color: ${color}`);

	const label = document.createElement('div');
	label.classList.add('collab-caret-label', 'collaboration-carets__label');
	label.setAttribute('style', `background-color: ${color}; color: ${textColor}`);
	label.appendChild(document.createTextNode(name));

	cursor.appendChild(label);
	return cursor;
};

function EnabledEditor({
	ydoc,
	provider,
	collaborator
}: {
	ydoc: Y.Doc;
	provider: HocuspocusProvider;
	collaborator: CollaboratorIdentity;
}) {
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
			}),
			CollaborationCaret.configure({
				provider,
				user: collaborator,
				render: collaborationCaretRender
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
	const [sessionKey, setSessionKey] = useState(0);
	const { ydoc, provider, collaborator, ready, displayConnectionStatus } = useCollaboration({ sessionKey });
	const awarenessPeers = useCollaborationAwarenessPeers(provider);

	const handleEditorReset = () => setSessionKey((k) => k + 1);

	return (
		<div className='space-y-3'>
			<DocumentActiveUsersHeader peers={awarenessPeers} status={displayConnectionStatus} />

			<EditorErrorBoundary onReset={handleEditorReset}>
				{!ready || !ydoc || !provider ?
					<p className='text-sm text-neutral-500'>Preparing editor…</p>
				:	<EnabledEditor
						key={sessionKey}
						ydoc={ydoc}
						provider={provider}
						collaborator={collaborator}
					/>
				}
			</EditorErrorBoundary>
		</div>
	);
}
