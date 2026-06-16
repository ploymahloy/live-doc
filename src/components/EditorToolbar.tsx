'use client';

import type { Editor } from '@tiptap/react';

import { btnToolbar, btnToolbarActive } from '@/lib/ui';

type EditorToolbarProps = {
	editor: Editor;
};

type ToolbarButtonProps = {
	label: string;
	shortLabel: string;
	pressed: boolean;
	onClick: () => void;
};

function ToolbarButton({ label, shortLabel, pressed, onClick }: ToolbarButtonProps) {
	return (
		<button
			type='button'
			onClick={onClick}
			aria-label={label}
			aria-pressed={pressed}
			className={[btnToolbar, pressed ? btnToolbarActive : ''].join(' ')}>
			<span className='hidden sm:inline'>{label}</span>
			<span className='sm:hidden'>{shortLabel}</span>
		</button>
	);
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
	return (
		<div
			role='toolbar'
			aria-label='Formatting'
			className='flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-neutral-900/10 bg-neutral-900/4 px-2 py-1.5'>
			<ToolbarButton
				label='Bold'
				shortLabel='B'
				pressed={editor.isActive('bold')}
				onClick={() => editor.chain().focus().toggleBold().run()}
			/>
			<ToolbarButton
				label='Italic'
				shortLabel='I'
				pressed={editor.isActive('italic')}
				onClick={() => editor.chain().focus().toggleItalic().run()}
			/>
			<span className='mx-1 h-5 w-px bg-neutral-900/10' aria-hidden />
			<ToolbarButton
				label='Heading 1'
				shortLabel='H1'
				pressed={editor.isActive('heading', { level: 1 })}
				onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
			/>
			<ToolbarButton
				label='Heading 2'
				shortLabel='H2'
				pressed={editor.isActive('heading', { level: 2 })}
				onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
			/>
			<ToolbarButton
				label='Heading 3'
				shortLabel='H3'
				pressed={editor.isActive('heading', { level: 3 })}
				onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
			/>
			<span className='mx-1 h-5 w-px bg-neutral-900/10' aria-hidden />
			<ToolbarButton
				label='Code block'
				shortLabel='{}'
				pressed={editor.isActive('codeBlock')}
				onClick={() => editor.chain().focus().toggleCodeBlock().run()}
			/>
		</div>
	);
}
