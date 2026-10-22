/**
 * Input formats, keyed by lowercase file extension. Every platform Obsidian
 * runs on decodes these natively, so supporting them costs no bundle size.
 */
const INPUT_MIME_TYPES = new Map<string, string>([
	['jpg', 'image/jpeg'],
	['jpeg', 'image/jpeg'],
	['png', 'image/png'],
	['webp', 'image/webp'],
	['avif', 'image/avif'],
	['gif', 'image/gif'],
]);

/**
 * Returns the MIME type for a supported input extension, or undefined if the
 * extension isn't a supported input. Case-insensitive.
 */
export function inputMimeType(extension: string): string | undefined {
	return INPUT_MIME_TYPES.get(extension.toLowerCase());
}
