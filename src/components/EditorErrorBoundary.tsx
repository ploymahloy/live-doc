'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type EditorErrorBoundaryProps = {
	children: ReactNode;
	onReset: () => void;
};

type EditorErrorBoundaryState = {
	hasError: boolean;
	error: Error | null;
};

export class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
	state: EditorErrorBoundaryState = { hasError: false, error: null };

	static getDerivedStateFromError(error: Error): EditorErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('Editor error:', error, info.componentStack);
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null });
		this.props.onReset();
	};

	render() {
		if (this.state.hasError) {
			return (
				<div
					className='flex min-h-48 flex-col justify-center gap-4 rounded-md p-4 ring-1 ring-neutral-900/10'
					role='alert'>
					<div className='space-y-1'>
						<p className='text-sm font-medium text-neutral-950'>The editor ran into a problem</p>
						<p className='text-sm text-neutral-600'>
							Your connection and collaborators are still shown above. You can try loading the editor again.
						</p>
					</div>
					{process.env.NODE_ENV === 'development' && this.state.error ?
						<pre className='overflow-x-auto rounded-md bg-neutral-900/6 px-3 py-2 font-mono text-xs text-neutral-700'>
							{this.state.error.message}
						</pre>
					:	null}
					<div>
						<button
							type='button'
							onClick={this.handleReset}
							className='rounded-md border border-neutral-900/10 bg-neutral-900/4 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-900/8'>
							Try again
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
