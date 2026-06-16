import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/app/providers';
import './globals.css';

const inter = Inter({
	subsets: ['latin'],
	variable: '--font-inter'
});

export const metadata: Metadata = {
	title: 'Live Doc',
	description: 'Real-time collaborative rich-text editing'
};

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang='en' className={`${inter.variable} m-0 box-border p-0`}>
			<body className='m-0 box-border bg-neutral-50 p-0 text-neutral-950 antialiased'>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
