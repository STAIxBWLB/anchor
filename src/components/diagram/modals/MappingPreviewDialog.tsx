import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  convertToNewDataset,
  type CrossConversionResult,
  type FieldMapping,
} from "../../../lib/diagram/convert";
import { getPattern } from "../../../lib/diagram/patterns";
import {
  KNOWN_SEMANTIC_TAGS,
  type SemanticTag,
} from "../../../lib/diagram/reportTypes";
import type { DiagramDoc } from "../../../lib/diagram/types";
import { useTranslation } from "../../../lib/i18n";

export interface MappingPreviewDialogProps {
  open: boolean;
  doc: DiagramDoc;
  sourceViewId: string;
  targetPatternId: string;
  /** Confirmed conversion — the parent dispatches the result and shows warnings. */
  onConfirm: (result: CrossConversionResult) => void;
  onCancel: () => void;
}

/**
 * Cross-family conversion preview: shows the pattern's suggested source→target
 * field mapping as editable dropdowns plus the exact warnings the conversion
 * would produce. The preview runs the pure `convertToNewDataset` on every
 * mapping change — the source doc is never mutated.
 */
export function MappingPreviewDialog({
  open,
  doc,
  sourceViewId,
  targetPatternId,
  onConfirm,
  onCancel,
}: MappingPreviewDialogProps) {
  const { t } = useTranslation();

  const view = (doc.views ?? []).find((v) => v.id === sourceViewId);
  const dataset = view
    ? (doc.datasets ?? []).find((ds) => ds.id === view.datasetId)
    : undefined;
  const pattern = getPattern(targetPatternId);

  const suggestions = useMemo(
    () => (dataset && pattern?.suggestMapping ? pattern.suggestMapping(dataset) : []),
    [dataset, pattern],
  );

  // source field key → target semantic tag ("" = ignore)
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const effectiveAssignments = useMemo(() => {
    const base: Record<string, string> = {};
    for (const suggestion of suggestions) {
      base[suggestion.source] = suggestion.target ?? "";
    }
    return { ...base, ...assignments };
  }, [suggestions, assignments]);

  const mapping: FieldMapping = useMemo(() => {
    const out: FieldMapping = {};
    for (const [source, tag] of Object.entries(effectiveAssignments)) {
      if (tag) out[tag] = source;
    }
    return out;
  }, [effectiveAssignments]);

  const preview = useMemo(() => {
    if (!open || !view || !dataset || !pattern) return null;
    try {
      return convertToNewDataset(doc, sourceViewId, targetPatternId, mapping, { t });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc, sourceViewId, targetPatternId, mapping, view, dataset, pattern]);

  if (!view || !dataset || !pattern) return null;

  const tagLabel = (tag: SemanticTag) =>
    t(KNOWN_SEMANTIC_TAGS.includes(tag as (typeof KNOWN_SEMANTIC_TAGS)[number])
      ? `diagram.pattern.field.${tag}`
      : "diagram.mapping.ignore");

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content maru-diagram-mapping-dialog">
          <div className="dialog-header">
            <Dialog.Title>{t("diagram.mapping.title")}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="icon-button"
                aria-label={t("diagram.mapping.cancel")}
                title={t("diagram.mapping.cancel")}
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>
          <table className="maru-diagram-mapping-table">
            <thead>
              <tr>
                <th>{t("diagram.mapping.source")}</th>
                <th>{t("diagram.mapping.target")}</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((suggestion) => (
                <tr key={suggestion.source}>
                  <td>
                    <span className="maru-diagram-mapping-source-label">
                      {suggestion.sourceLabel}
                    </span>
                    {suggestion.sourceTag ? (
                      <span className="maru-diagram-mapping-source-tag">
                        {tagLabel(suggestion.sourceTag)}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <select
                      value={effectiveAssignments[suggestion.source] ?? ""}
                      aria-label={suggestion.sourceLabel}
                      onChange={(e) =>
                        setAssignments((prev) => ({
                          ...prev,
                          [suggestion.source]: e.target.value,
                        }))
                      }
                    >
                      <option value="">{t("diagram.mapping.ignore")}</option>
                      {KNOWN_SEMANTIC_TAGS.map((tag) => (
                        <option key={tag} value={tag}>
                          {tagLabel(tag)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview && preview.warnings.length > 0 ? (
            <div className="maru-diagram-mapping-warnings">
              <h3>{t("diagram.mapping.warnings")}</h3>
              <ul>
                {preview.warnings.map((warning, i) => (
                  <li key={`${i}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="maru-diagram-template-actions">
            <button type="button" onClick={onCancel}>
              {t("diagram.mapping.cancel")}
            </button>
            <button
              type="button"
              className="maru-diagram-toolbar-primary"
              disabled={!preview}
              onClick={() => preview && onConfirm(preview)}
            >
              {t("diagram.mapping.confirm")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
