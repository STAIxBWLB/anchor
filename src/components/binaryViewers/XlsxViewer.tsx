import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { assetUrlForPath } from "../../lib/binaryViewer";
import { useTranslation } from "../../lib/i18n";
import type { WorkspaceFileEntry } from "../../lib/types";

interface Props {
  entry: WorkspaceFileEntry;
}

interface SheetPreview {
  name: string;
  html: string;
}

export function XlsxViewer({ entry }: Props) {
  const { t } = useTranslation();
  const [sheets, setSheets] = useState<SheetPreview[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setActive(0);
    setError(null);

    (async () => {
      try {
        const response = await fetch(assetUrlForPath(entry.path));
        if (!response.ok) {
          throw new Error(`Failed to fetch spreadsheet: HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;
        const xlsx = await import("xlsx");
        if (cancelled) return;
        const workbook = xlsx.read(arrayBuffer, { type: "array" });
        const previews: SheetPreview[] = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          if (!sheet) return { name, html: "" };
          const raw = xlsx.utils.sheet_to_html(sheet, { id: name });
          const sanitized = DOMPurify.sanitize(raw, {
            USE_PROFILES: { html: true },
          });
          return { name, html: sanitized };
        });
        if (!cancelled) setSheets(previews);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry.path]);

  if (error) {
    return (
      <div className="binary-viewer-error">
        {t("binaryViewer.loadError", { message: error })}
      </div>
    );
  }
  if (sheets === null) {
    return <div className="binary-viewer-loading">{t("binaryViewer.loading")}</div>;
  }
  if (sheets.length === 0) {
    return <div className="binary-viewer-empty">{t("binaryViewer.empty")}</div>;
  }
  const current = sheets[Math.min(active, sheets.length - 1)] ?? sheets[0];

  return (
    <div className="binary-viewer binary-viewer--xlsx">
      <div className="binary-viewer-toolbar binary-viewer-tabs" role="tablist" aria-label={t("binaryViewer.sheets")}>
        {sheets.map((sheet, index) => (
          <button
            type="button"
            key={sheet.name + index}
            role="tab"
            aria-selected={index === active}
            className={index === active ? "is-active" : undefined}
            onClick={() => setActive(index)}
          >
            {sheet.name}
          </button>
        ))}
      </div>
      <div
        key={current.name + active}
        className="binary-viewer-canvas binary-viewer-canvas--xlsx"
        dangerouslySetInnerHTML={{ __html: current.html }}
      />
    </div>
  );
}
