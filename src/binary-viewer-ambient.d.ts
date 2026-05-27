// Ambient declarations for runtime-only imports used by binary viewer.

declare module "mammoth/mammoth.browser.js" {
  // Browser bundle exposes the same API surface as the node entry; we type only
  // what the viewer uses.
  interface ConvertResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  interface ConvertOptions {
    includeDefaultStyleMap?: boolean;
  }
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: ConvertOptions,
  ): Promise<ConvertResult>;
  const _default: {
    convertToHtml: typeof convertToHtml;
  };
  export default _default;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const src: string;
  export default src;
}
