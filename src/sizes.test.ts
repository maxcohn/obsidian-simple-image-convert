import { describe, expect, it } from 'vitest';
import { formatBytes } from './sizes';

describe('formatBytes', () => {
	it('picks a unit and precision', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(999)).toBe('999 B');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(340 * 1024)).toBe('340 KB');
		expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.2 MB');
	});
});
