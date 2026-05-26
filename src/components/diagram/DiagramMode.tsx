import {
  Maximize2,
  MousePointer2,
  Network,
  Plus,
  Redo2,
  Save,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  addNode,
  defaultCoalescer,
  redo as redoAction,
  removeNodes,
  replaceDoc,
  setDocTitle,
  setSelection,
  setViewport,
  undo as undoAction,
  withSnapshot,
} from "../../lib/diagram/actions";
import { fitView } from "../../lib/diagram/geometry";
import {
  deleteDiagram,
  listDiagrams,
  readDiagram,
  type DiagramFile,
  writeDiagram,
} from "../../lib/diagram/persistence";
import { createEmptyDoc } from "../../lib/diagram/types";
import { useTranslation } from "../../lib/i18n";
import {
  DiagramStoreProvider,
  useDiagram,
  useDiagramStore,
} from "./DiagramStoreContext";
import { CanvasSurface } from "./canvas/CanvasSurface";
import "./diagram.css";

export interface DiagramModeProps {
  workPath: string | null;
  onError?: (message: string | null) => void;
}

const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

export function DiagramMode({ workPath, onError }: DiagramModeProps) {
  return (
    <DiagramStoreProvider>
      <DiagramShell workPath={workPath} onError={onError} />
    </DiagramStoreProvider>
  );
}

function DiagramShell({ workPath, onError }: DiagramModeProps) {
  const { t } = useTranslation();
  const store = useDiagramStore();
  const nodes = useDiagram((s) => s.doc.nodes);
  const docTitle = useDiagram((s) => s.doc.docTitle);
  const selection = useDiagram((s) => s.ephemeral.selection.nodes);
  const history = useDiagram((s) => s.ephemeral.history);
  const viewport = useDiagram((s) => s.ephemeral.viewport);

  const [activeName, setActiveName] = useState<string | null>(null);
  const [lastSavedBody, setLastSavedBody] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [files, setFiles] = useState<DiagramFile[]>([]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const insertOffsetRef = useRef(0);

  const docBody = useMemo(() => JSON.stringify(store.getState().doc), [nodes, docTitle]);
  const dirty = lastSavedBody !== null ? docBody !== lastSavedBody : nodes.length > 0;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const reportError = useCallback(
    (message: string | null) => {
      onError?.(message);
    },
    [onError],
  );

  const refreshList = useCallback(async () => {
    if (!workPath) return;
    try {
      const list = await listDiagrams(workPath);
      setFiles(list);
    } catch (err) {
      reportError(
        t("diagram.error.load", { message: (err as Error).message ?? "unknown" }),
      );
    }
  }, [reportError, t, workPath]);

  useEffect(() => {
    if (workPath && listOpen) void refreshList();
  }, [listOpen, refreshList, workPath]);

  const insertAtCenter = useCallback(
    (kind: "simple" | "text") => {
      const el = viewportRef.current;
      const rect = el?.getBoundingClientRect();
      const cx = rect ? rect.width / 2 : 400;
      const cy = rect ? rect.height / 2 : 300;
      const canvasX = (cx - viewport.px) / viewport.zoom;
      const canvasY = (cy - viewport.py) / viewport.zoom;
      const offset = (insertOffsetRef.current % 5) * 16;
      insertOffsetRef.current += 1;
      store.setState(
        withSnapshot(
          addNode(kind, canvasX + offset, canvasY + offset, {
            title: kind === "text" ? t("diagram.toolbar.addText") : "",
          }),
          defaultCoalescer(),
        ),
      );
    },
    [store, t, viewport.px, viewport.py, viewport.zoom],
  );

  const handleDelete = useCallback(() => {
    if (selection.size === 0) return;
    store.setState(withSnapshot(removeNodes(selection), defaultCoalescer()));
  }, [selection, store]);

  const handleUndo = useCallback(() => store.setState(undoAction()), [store]);
  const handleRedo = useCallback(() => store.setState(redoAction()), [store]);

  const handleZoom = useCallback(
    (factor: number) => {
      const el = viewportRef.current;
      const rect = el?.getBoundingClientRect();
      const cx = rect ? rect.width / 2 : 400;
      const cy = rect ? rect.height / 2 : 300;
      const canvasX = (cx - viewport.px) / viewport.zoom;
      const canvasY = (cy - viewport.py) / viewport.zoom;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor));
      const px = cx - canvasX * zoom;
      const py = cy - canvasY * zoom;
      store.setState(setViewport({ zoom, px, py }));
    },
    [store, viewport.px, viewport.py, viewport.zoom],
  );

  const handleFitView = useCallback(() => {
    const el = viewportRef.current;
    const rect = el?.getBoundingClientRect();
    const next = fitView({
      nodes: store.getState().doc.nodes,
      viewportW: rect?.width ?? 800,
      viewportH: rect?.height ?? 600,
    });
    store.setState(setViewport(next));
  }, [store]);

  const handleSave = useCallback(async () => {
    if (!workPath) {
      reportError(t("diagram.status.noWorkspace"));
      return;
    }
    let name = activeName;
    if (!name) {
      const proposed = docTitle.trim() || `diagram-${new Date().toISOString().slice(0, 10)}`;
      const answer = typeof window === "undefined" ? null : window.prompt(t("diagram.prompt.saveAs"), proposed);
      if (!answer) return;
      name = answer.trim();
      if (!name) return;
    }
    setSaving(true);
    reportError(null);
    try {
      const current = store.getState().doc;
      const written = await writeDiagram(workPath, name, current);
      store.setState((s) => ({ ...s, doc: written }));
      setActiveName(name);
      setLastSavedBody(JSON.stringify(written));
    } catch (err) {
      reportError(
        t("diagram.error.save", { message: (err as Error).message ?? "unknown" }),
      );
    } finally {
      setSaving(false);
    }
  }, [activeName, docTitle, reportError, store, t, workPath]);

  const handleNew = useCallback(() => {
    const fresh = createEmptyDoc(crypto.randomUUID());
    store.setState(replaceDoc(fresh));
    setActiveName(null);
    setLastSavedBody(null);
    reportError(null);
  }, [reportError, store]);

  const handleOpen = useCallback(
    async (name: string) => {
      if (!workPath) return;
      try {
        const doc = await readDiagram(workPath, name);
        store.setState(replaceDoc(doc));
        setActiveName(name);
        setLastSavedBody(JSON.stringify(doc));
        setListOpen(false);
        reportError(null);
      } catch (err) {
        reportError(
          t("diagram.error.load", { message: (err as Error).message ?? "unknown" }),
        );
      }
    },
    [reportError, store, t, workPath],
  );

  const handleDeleteFile = useCallback(
    async (name: string) => {
      if (!workPath) return;
      try {
        await deleteDiagram(workPath, name);
        await refreshList();
        if (activeName === name) {
          handleNew();
        }
      } catch (err) {
        reportError(
          t("diagram.error.load", { message: (err as Error).message ?? "unknown" }),
        );
      }
    },
    [activeName, handleNew, refreshList, reportError, t, workPath],
  );

  // Keyboard shortcuts scoped to the diagram pane.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (!inField && (event.key === "Delete" || event.key === "Backspace")) {
        if (selection.size > 0) {
          event.preventDefault();
          handleDelete();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDelete, handleRedo, handleSave, handleUndo, selection]);

  const statusLabel = saving
    ? t("diagram.status.saving")
    : dirty
      ? t("diagram.status.dirty")
      : activeName
        ? t("diagram.status.saved")
        : "";

  return (
    <div className="anchor-diagram" data-testid="diagram-mode" role="region" aria-label={t("mode.diagram")}>
      <header className="anchor-diagram-header">
        <div className="anchor-diagram-title">
          <Network size={20} strokeWidth={1.9} aria-hidden="true" />
          <input
            className="anchor-diagram-title-input"
            value={docTitle}
            placeholder={t("diagram.title.placeholder")}
            onChange={(e) => store.setState(setDocTitle(e.target.value))}
            aria-label={t("diagram.title.placeholder")}
          />
          {statusLabel ? (
            <span className={`anchor-diagram-status anchor-diagram-status-${dirty ? "dirty" : "saved"}`}>
              {statusLabel}
            </span>
          ) : null}
        </div>
        <div className="anchor-diagram-meta">
          <span className="anchor-diagram-meta-label">{t("diagram.scaffold.workspace")}</span>
          <code>{workPath ?? "—"}</code>
        </div>
      </header>
      <div className="anchor-diagram-toolbar" role="toolbar" aria-label={t("mode.diagram")}>
        <button type="button" onClick={() => insertAtCenter("simple")} title={t("diagram.toolbar.addSimple")}>
          <Plus size={16} /> {t("diagram.toolbar.addSimple")}
        </button>
        <button type="button" onClick={() => insertAtCenter("text")} title={t("diagram.toolbar.addText")}>
          <Type size={16} /> {t("diagram.toolbar.addText")}
        </button>
        <span className="anchor-diagram-sep" />
        <button type="button" onClick={handleDelete} disabled={selection.size === 0} title={t("diagram.toolbar.delete")}>
          <Trash2 size={16} /> {t("diagram.toolbar.delete")}
        </button>
        <button type="button" onClick={handleUndo} disabled={!canUndo} title={t("diagram.toolbar.undo")}>
          <Undo2 size={16} />
        </button>
        <button type="button" onClick={handleRedo} disabled={!canRedo} title={t("diagram.toolbar.redo")}>
          <Redo2 size={16} />
        </button>
        <span className="anchor-diagram-sep" />
        <button type="button" onClick={() => handleZoom(1 / ZOOM_STEP)} title={t("diagram.toolbar.zoomOut")}>
          <ZoomOut size={16} />
        </button>
        <span className="anchor-diagram-zoom-label">{Math.round(viewport.zoom * 100)}%</span>
        <button type="button" onClick={() => handleZoom(ZOOM_STEP)} title={t("diagram.toolbar.zoomIn")}>
          <ZoomIn size={16} />
        </button>
        <button type="button" onClick={handleFitView} title={t("diagram.toolbar.fitView")}>
          <Maximize2 size={16} /> {t("diagram.toolbar.fitView")}
        </button>
        <button
          type="button"
          onClick={() => store.setState(setSelection([]))}
          title={t("diagram.toolbar.delete")}
          aria-label="Clear selection"
        >
          <MousePointer2 size={16} />
        </button>
        <span className="anchor-diagram-spacer" />
        <button type="button" onClick={handleNew} title={t("diagram.toolbar.new")}>
          {t("diagram.toolbar.new")}
        </button>
        <button type="button" onClick={() => setListOpen((o) => !o)} title={t("diagram.toolbar.open")}>
          {t("diagram.toolbar.open")}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !workPath}
          title={t("diagram.toolbar.save")}
          className="anchor-diagram-toolbar-primary"
        >
          <Save size={16} /> {t("diagram.toolbar.save")}
        </button>
      </div>
      <div className="anchor-diagram-viewport" ref={viewportRef}>
        <CanvasSurface />
        {listOpen ? (
          <aside className="anchor-diagram-list" aria-label={t("diagram.list.heading")}>
            <div className="anchor-diagram-list-head">
              <h2>{t("diagram.list.heading")}</h2>
              <button type="button" onClick={() => setListOpen(false)}>
                {t("diagram.list.close")}
              </button>
            </div>
            {files.length === 0 ? (
              <p className="anchor-diagram-list-empty">{t("diagram.list.empty")}</p>
            ) : (
              <ul>
                {files.map((file) => (
                  <li key={file.name}>
                    <button type="button" onClick={() => void handleOpen(file.name)}>
                      <span className="anchor-diagram-list-name">{file.docTitle || file.name}</span>
                      <span className="anchor-diagram-list-meta">
                        {new Date(file.modifiedAt).toLocaleString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="anchor-diagram-list-delete"
                      onClick={() => void handleDeleteFile(file.name)}
                      title={t("diagram.toolbar.delete")}
                      aria-label={t("diagram.toolbar.delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export default DiagramMode;
