'use client';

import { StrictMode } from 'react';

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
	return <StrictMode>{children}</StrictMode>;
}
