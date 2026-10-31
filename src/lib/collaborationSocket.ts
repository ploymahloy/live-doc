import {
	HocuspocusProvider,
	HocuspocusProviderWebsocket,
	type HocuspocusProviderWebsocketConfiguration,
	type onAuthenticationFailedParameters,
	type onDisconnectParameters,
	type onStatusParameters
} from '@hocuspocus/provider';
import type * as Y from 'yjs';

/**
 * Typed reconnect settings for `HocuspocusProviderWebsocket`.
 * `maxAttempts: 0` means unlimited. The provider constructor does not type these fields.
 */
export const COLLABORATION_RECONNECT = {
	maxAttempts: 0,
	delay: 1000,
	initialDelay: 0,
	factor: 2,
	minDelay: 1000,
	maxDelay: 30_000,
	jitter: true
} as const satisfies Partial<HocuspocusProviderWebsocketConfiguration>;

export type CollaborationSocketOverrides = Partial<
	Pick<
		HocuspocusProviderWebsocketConfiguration,
		'autoConnect' | 'delay' | 'initialDelay' | 'factor' | 'maxAttempts' | 'minDelay' | 'maxDelay' | 'jitter' | 'timeout'
	>
>;

export function createCollaborationSocket(
	url: string,
	overrides: CollaborationSocketOverrides = {}
): HocuspocusProviderWebsocket {
	return new HocuspocusProviderWebsocket({
		url,
		...COLLABORATION_RECONNECT,
		...overrides
	});
}

export type CollaborationProviderOptions = {
	url: string;
	name: string;
	document: Y.Doc;
	socket?: CollaborationSocketOverrides;
	token?: string | (() => string) | (() => Promise<string>) | null;
	onStatus?: (data: onStatusParameters) => void;
	onDisconnect?: (data: onDisconnectParameters) => void;
	onAuthenticationFailed?: (data: onAuthenticationFailedParameters) => void;
};

export function createCollaborationProvider(options: CollaborationProviderOptions): {
	provider: HocuspocusProvider;
	socket: HocuspocusProviderWebsocket;
} {
	const socket = createCollaborationSocket(options.url, options.socket);
	const provider = new HocuspocusProvider({
		name: options.name,
		document: options.document,
		websocketProvider: socket,
		...(options.token != null ? { token: options.token } : {}),
		...(options.onStatus ? { onStatus: options.onStatus } : {}),
		...(options.onDisconnect ? { onDisconnect: options.onDisconnect } : {}),
		...(options.onAuthenticationFailed ? { onAuthenticationFailed: options.onAuthenticationFailed } : {})
	});
	// A caller-supplied socket is not attached or destroyed by the provider.
	provider.attach();
	return { provider, socket };
}
