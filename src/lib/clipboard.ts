import { readText, writeHtml, writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const isTauri = () => typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

/** Native clipboard write — bypasses WebKit's paste consent overlay. */
export async function clipboardWriteText(text: string): Promise<void> {
  if (!isTauri()) {
    await navigator.clipboard.writeText(text);
    return;
  }
  await writeText(text);
}

/** Native clipboard read. The plugin rejects with arboard's
 *  ContentNotAvailable message when the clipboard holds no text — treat only
 *  that as empty; real failures (permissions, OS errors) propagate so callers
 *  can surface them. */
export async function clipboardReadText(): Promise<string> {
  if (!isTauri()) return navigator.clipboard.readText();
  try {
    return await readText();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("clipboard is empty")) return "";
    throw err;
  }
}

type ClipboardItemLike = new (items: Record<string, Blob>) => unknown;

function clipboardItemCtor(): ClipboardItemLike | null {
  if (typeof window === "undefined") return null;
  return (window as { ClipboardItem?: ClipboardItemLike }).ClipboardItem ?? null;
}

/** Copy PNG bytes to the OS clipboard (Tauri plugin, else async Clipboard API). */
export async function clipboardWriteImagePng(bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    await writeImage(bytes);
    return;
  }
  const Ctor = clipboardItemCtor();
  if (typeof navigator !== "undefined" && navigator.clipboard && Ctor) {
    const blob = new Blob([bytes as unknown as BlobPart], { type: "image/png" });
    await navigator.clipboard.write([new Ctor({ "image/png": blob }) as ClipboardItem]);
    return;
  }
  throw new Error("clipboard_image_unsupported");
}

/**
 * Copy HTML (table markup) to the OS clipboard with a plain-text fallback
 * (TSV). Tauri uses the plugin's writeHtml; the browser fallback writes both
 * MIME types via the async Clipboard API, else degrades to the alt text.
 */
export async function clipboardWriteHtml(html: string, altText: string): Promise<void> {
  if (isTauri()) {
    await writeHtml(html, altText);
    return;
  }
  const Ctor = clipboardItemCtor();
  if (typeof navigator !== "undefined" && navigator.clipboard && Ctor) {
    const item = new Ctor({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([altText], { type: "text/plain" }),
    }) as ClipboardItem;
    await navigator.clipboard.write([item]);
    return;
  }
  await navigator.clipboard.writeText(altText);
}

/**
 * Read `text/html` from the OS clipboard via the async Clipboard API (the
 * Tauri plugin has no readHtml). Returns null when unavailable, denied, or
 * when the clipboard holds no HTML — callers degrade to plain text.
 */
export async function clipboardReadHtml(): Promise<string | null> {
  if (typeof navigator === "undefined" || typeof navigator.clipboard?.read !== "function") {
    return null;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes("text/html")) {
        const blob = await item.getType("text/html");
        return await blob.text();
      }
    }
  } catch {
    return null;
  }
  return null;
}
