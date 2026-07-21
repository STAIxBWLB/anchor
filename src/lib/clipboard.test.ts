import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pluginReadText = vi.fn(async (): Promise<string> => "from-plugin");
const pluginWriteText = vi.fn(async (_text: string) => undefined);
const pluginWriteImage = vi.fn(async (_image: unknown) => undefined);
const pluginWriteHtml = vi.fn(async (_html: string, _alt?: string) => undefined);
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: () => pluginReadText(),
  writeText: (text: string) => pluginWriteText(text),
  writeImage: (image: unknown) => pluginWriteImage(image),
  writeHtml: (html: string, alt?: string) => pluginWriteHtml(html, alt),
}));

import {
  clipboardReadText,
  clipboardWriteHtml,
  clipboardWriteImagePng,
  clipboardWriteText,
} from "./clipboard";

function enterTauri() {
  (globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: {} };
}

const navigatorClipboard = {
  readText: vi.fn(async (): Promise<string> => "from-navigator"),
  writeText: vi.fn(async (_text: string) => undefined),
};

describe("clipboard helpers", () => {
  beforeEach(() => {
    pluginReadText.mockClear();
    pluginReadText.mockResolvedValue("from-plugin");
    pluginWriteText.mockClear();
    pluginWriteImage.mockClear();
    pluginWriteHtml.mockClear();
    navigatorClipboard.readText.mockClear();
    navigatorClipboard.writeText.mockClear();
    vi.stubGlobal("navigator", { clipboard: navigatorClipboard });
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.unstubAllGlobals();
  });

  it("reads through the Tauri plugin when running inside Tauri", async () => {
    enterTauri();
    await expect(clipboardReadText()).resolves.toBe("from-plugin");
    expect(pluginReadText).toHaveBeenCalledTimes(1);
    expect(navigatorClipboard.readText).not.toHaveBeenCalled();
  });

  it("treats the plugin's empty-clipboard rejection as empty text", async () => {
    enterTauri();
    // The plugin serializes arboard's ContentNotAvailable error as this
    // plain string (tauri-plugin-clipboard-manager 2.x).
    pluginReadText.mockRejectedValueOnce(
      "The clipboard contents were not available in the requested format or the clipboard is empty.",
    );
    await expect(clipboardReadText()).resolves.toBe("");
  });

  it("rethrows real clipboard failures so callers can surface them", async () => {
    enterTauri();
    pluginReadText.mockRejectedValueOnce(new Error("clipboard access denied"));
    await expect(clipboardReadText()).rejects.toThrow("clipboard access denied");
  });

  it("writes through the Tauri plugin when running inside Tauri", async () => {
    enterTauri();
    await clipboardWriteText("hello");
    expect(pluginWriteText).toHaveBeenCalledWith("hello");
    expect(navigatorClipboard.writeText).not.toHaveBeenCalled();
  });

  it("falls back to navigator.clipboard outside Tauri", async () => {
    await expect(clipboardReadText()).resolves.toBe("from-navigator");
    await clipboardWriteText("dev");
    expect(navigatorClipboard.writeText).toHaveBeenCalledWith("dev");
    expect(pluginReadText).not.toHaveBeenCalled();
    expect(pluginWriteText).not.toHaveBeenCalled();
  });
});

describe("clipboard write helpers (image / html)", () => {
  beforeEach(() => {
    pluginWriteImage.mockClear();
    pluginWriteHtml.mockClear();
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("clipboardWriteImagePng forwards PNG bytes to the plugin writeImage", async () => {
    enterTauri();
    const bytes = new Uint8Array([137, 80, 78, 71]);
    await clipboardWriteImagePng(bytes);
    expect(pluginWriteImage).toHaveBeenCalledTimes(1);
    expect(pluginWriteImage).toHaveBeenCalledWith(bytes);
  });

  it("clipboardWriteImagePng propagates plugin failures", async () => {
    enterTauri();
    pluginWriteImage.mockRejectedValueOnce(new Error("unsupported"));
    await expect(clipboardWriteImagePng(new Uint8Array([1]))).rejects.toThrow("unsupported");
  });

  it("clipboardWriteHtml forwards html + alt text to the plugin writeHtml", async () => {
    enterTauri();
    await clipboardWriteHtml("<table><tr><td>a</td></tr></table>", "a");
    expect(pluginWriteHtml).toHaveBeenCalledTimes(1);
    expect(pluginWriteHtml).toHaveBeenCalledWith("<table><tr><td>a</td></tr></table>", "a");
  });
});
