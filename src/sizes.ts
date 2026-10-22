const UNITS = ['B', 'KB', 'MB', 'GB'];

/** Formats a byte count for display, e.g. 1536 → "1.5 KB". */
export function formatBytes(bytes: number): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit++;
	}
	const digits = unit === 0 || value >= 100 ? 0 : 1;
	return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/** Formats the relative change from one size to another, e.g. "−72%" or "+5%". */
export function formatSizeChange(before: number, after: number): string {
	const percent = Math.round(((after - before) / before) * 100);
	const sign = percent > 0 ? '+' : percent < 0 ? '−' : '±';
	return `${sign}${Math.abs(percent)}%`;
}
