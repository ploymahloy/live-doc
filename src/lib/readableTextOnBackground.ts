type Rgb = { r: number; g: number; b: number };

function parseHexChannelPair(pair: string): number | null {
	const value = Number.parseInt(pair, 16);
	return Number.isFinite(value) && value >= 0 && value <= 255 ? value : null;
}

/**
 * Parses #RGB or #RRGGBB (case-insensitive). Returns null when invalid.
 */
export function parseHexRgb(hexInput: string): Rgb | null {
	const trimmed = hexInput.trim();
	const short =
		trimmed.length === 4 ? /^#([\da-f])([\da-f])([\da-f])$/iu.exec(trimmed) : null;
	const long =
		trimmed.length === 7 ? /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(trimmed) : null;

	if (!short && !long) {
		return null;
	}

	const rHex = short ? short[1]!.repeat(2) : long![1]!;
	const gHex = short ? short[2]!.repeat(2) : long![2]!;
	const bHex = short ? short[3]!.repeat(2) : long![3]!;

	const r = parseHexChannelPair(rHex);
	const g = parseHexChannelPair(gHex);
	const b = parseHexChannelPair(bHex);

	if (r === null || g === null || b === null) {
		return null;
	}

	return { r, g, b };
}

function linearizeChannel(unit: number): number {
	const s = unit / 255;
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance (WCAG 2.1), 0–1. */
export function relativeLuminance({ r, g, b }: Rgb): number {
	const rl = linearizeChannel(r);
	const gl = linearizeChannel(g);
	const bl = linearizeChannel(b);
	return rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
}

/** WCAG contrast ratio between two opaque sRGB colors. */
export function contrastRatio(rgbA: Rgb, rgbB: Rgb): number {
	const lumA = relativeLuminance(rgbA);
	const lumB = relativeLuminance(rgbB);
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
}

const BLACK_HARD: Rgb = { r: 0, g: 0, b: 0 };
const WHITE_HARD: Rgb = { r: 255, g: 255, b: 255 };

/** Softer foregrounds tuned for badges; escalate to `#000/#fff` if neither passes 4.5:1. */
const FOREGROUND_FALLBACK_SEQUENCE = ['#171717', '#fafafa'] as const;

/**
 * Chooses a hex foreground for solid `backgroundHex` (e.g. collaboration caret badges ~12px bold).
 */
export function readableTextHexOnBackground(backgroundHex: string): string {
	const bg = parseHexRgb(backgroundHex);
	if (!bg) {
		return '#171717';
	}

	for (const hex of FOREGROUND_FALLBACK_SEQUENCE) {
		const fg = parseHexRgb(hex);
		if (fg !== null && contrastRatio(fg, bg) >= 4.5) {
			return hex;
		}
	}

	const blackRatio = contrastRatio(BLACK_HARD, bg);
	const whiteRatio = contrastRatio(WHITE_HARD, bg);
	return blackRatio >= whiteRatio ? '#000000' : '#ffffff';
}
