/** Turns decoded pixels into the bytes of one output format. */
export interface ImageEncoder {
	/** Format name shown to the user, as in "Convert to WebP". */
	label: string;
	/** Output file extension, without the dot. */
	extension: string;
	/** Encodes at a quality from 1 (smallest file) to 100 (best quality). */
	encode(image: ImageData, quality: number): Promise<ArrayBuffer>;
}
