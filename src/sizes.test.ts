import { describe, expect, it } from 'vitest';
import { formatBytes, formatSizeChange } from './sizes';

describe('formatBytes', () => {
	it('picks a unit and precision', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(999)).toBe('999 B');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(340 * 1024)).toBe('340 KB');
		expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.2 MB');
	});
});

describe('formatSizeChange', () => {
	it('signs and rounds the percentage', () => {
		expect(formatSizeChange(1000, 280)).toBe('−72%');
		expect(formatSizeChange(1000, 1050)).toBe('+5%');
		expect(formatSizeChange(1000, 1000)).toBe('±0%');
		expect(formatSizeChange(1000, 999)).toBe('±0%');
	});
});
