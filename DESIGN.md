# Design

Working notes on what this plugin is, what it deliberately isn't, and why. This will eventually be folded into the README.

## Purpose

Convert and compress an image in the vault to WebP. The main use case is phone photos that are far larger than a note needs.

## Principles

- **One entry point.** A single **Convert to WebP** item in the file menu: the three-dot menu of an open image, or a right-click or long-press in the file explorer. No commands, ribbon icons, or automatic triggers.
- **One setting.** Quality, from 1 to 100.
- **Same behavior on every platform.** Desktop, iOS, and Android run the same code path and produce the same output for the same input and quality. No Node or Electron APIs.
- **Local only.** No network access of any kind.
- **Links survive.** The converted file takes the original's place, and Obsidian's own rename machinery updates links to it, following the user's link-update preference.
- **The original is recoverable.** Its bytes go through Obsidian's trash, so the user's **Deleted files** setting decides where they end up.
- **Refuse rather than degrade.** Animated images are refused instead of being silently flattened to their first frame. An existing file at the target path aborts the conversion instead of being overwritten or renamed around.
- **Warn rather than block.** If the output would be larger than the input, a modal shows both sizes and lets the user decide.
- **Small and boring code.** Each module has one job, and nothing gets built for a hypothetical second use until that use exists.

## Non-goals

- Converting several files at once (multi-select or folders)
- Converting automatically on paste, drop, or file creation
- Resizing, cropping, or rotating
- Preserving metadata (EXIF, GPS, color profiles). Stripping it is treated as a feature.
- Custom output names or naming patterns
- HEIC input (see below)

## Formats

**Input:** JPEG, PNG, WebP, AVIF, and static GIF. Every platform Obsidian runs on can decode these natively, so they add nothing to the bundle.

**Output:** WebP only for now.

### Why no HEIC

HEIC is what iPhones capture by default, so leaving it out is a real gap. The cost of supporting it was too high for a minimal plugin:

- **No native decoder where it matters.** Desktop Obsidian runs on Chromium, which can't decode HEIC, and neither can Android. Only iOS can.
- **Licensing.** The only practical decoder is libheif plus libde265 compiled to WASM, and both are LGPL-3.0. An MIT plugin can bundle LGPL code, but that means shipping license notices, pointing to the corresponding source, and keeping the library swappable (LGPL's relinking clause). For a single bundled `main.js`, the relinking part is a gray area.
- **Patents.** HEIC images are HEVC-encoded, and HEVC is patent-encumbered. libde265 comes with no patent license.
- **Size.** It would grow `main.js` from roughly 0.5 MB to 2 MB or more.

Workaround: on iPhone, **Settings → Camera → Formats → Most Compatible** captures JPEG instead. Many iOS share and export flows also convert HEIC to JPEG on their own.

## Architecture

The pipeline is **bytes → `ImageData` → bytes**:

1. Read the file's bytes from the vault.
2. Refuse animated inputs.
3. Decode with the platform: `createImageBitmap`, drawn to a canvas, read back with `getImageData`. EXIF orientation is applied here.
4. Encode with the selected encoder.
5. If the output is larger than the input, warn.
6. Write the result: rename the file to the new extension (which updates links), write the new bytes, and send the original bytes to the trash.

`ImageData` is the seam between decoding and encoding. Decoders know nothing about output formats, and encoders know nothing about input formats.

### Encoders

An encoder implements a single interface:

```ts
interface ImageEncoder {
	id: string;
	label: string;     // shown in the menu: "Convert to {label}"
	extension: string;
	mimeType: string;
	encode(image: ImageData, quality: number): Promise<ArrayBuffer>;
}
```

WebP uses libwebp compiled to WASM (`@jsquash/webp`, Apache-2.0 / BSD) on **every** platform. iOS can't produce WebP through `canvas.toBlob`, and using one encoder everywhere keeps the output identical across devices. The WASM is inlined into `main.js` and compiled lazily on the first conversion, so plugin startup stays light.

### Adding another output format (e.g. JPEG XL)

1. Add `src/encoders/jxl.ts` implementing `ImageEncoder`, probably with `@jsquash/jxl`.
2. Add a way to choose it, either an output-format setting or one menu item per encoder. That decision waits until a second encoder actually exists.

Nothing on the decoding or writing side changes.

## Platform caveats

- **iOS can't encode WebP natively**, which is why the encoder is WASM. TODO: switch to native canvas encoding if iOS ever supports it, and drop the WASM.
- **iOS canvas size limit.** iOS caps a canvas at about 16.7 megapixels. A typical 12 MP phone photo fits; 48 MP images won't decode on iOS and fail with an error.
- **Color.** Decoding through a canvas converts to sRGB, so wide-gamut (Display P3) photos lose some gamut.
- **Main-thread encoding.** Encoding runs on the main thread, so the UI pauses briefly on large images. A Web Worker is a possible later improvement.

## Implementation phases

Each phase ends with uncommitted changes to review and test before the next one starts.

0. Scaffold (tooling, manifest, empty plugin) and this document
1. Quality setting and the file-menu entry, with no conversion yet
2. Decode and encode pipeline, writing `foo.converted.webp` next to the original (non-destructive)
3. Replace semantics (rename, link updates, trash the original), the size-warning modal, and notices
4. Release readiness: README, bundle size and license-notice checks, full mobile pass
