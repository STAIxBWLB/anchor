import * as Dialog from "@radix-ui/react-dialog";
import { FolderOpen, FolderPlus, Link2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { chooseWorkspaceDirectory } from "../lib/api";
import { detectWorkspace } from "../lib/anchorDir";
import { useTranslation } from "../lib/i18n";
import type { WorkspaceDetect, WorkspaceVisibility } from "../lib/types";
import { Button } from "./ui/Button";
import { Field, TextInput } from "./ui/Field";

interface AddWorkspaceDialogProps {
  open: boolean;
  defaultVisibility: WorkspaceVisibility;
  onOpenChange: (open: boolean) => void;
  onAdd: (
    label: string,
    path: string,
    visibility: WorkspaceVisibility,
    externalWriter: string | null,
  ) => Promise<void>;
  onRegisterWorkspace: (workPath: string) => Promise<void>;
}

type WriterChoice = "none" | "obsidian";

export function AddWorkspaceDialog({
  open,
  defaultVisibility,
  onOpenChange,
  onAdd,
  onRegisterWorkspace,
}: AddWorkspaceDialogProps) {
  const { t } = useTranslation();
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");
  const [visibility, setVisibility] = useState<WorkspaceVisibility>(defaultVisibility);
  const [writer, setWriter] = useState<WriterChoice>("none");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState<WorkspaceDetect | null>(null);
  const detectSeqRef = useRef(0);

  useEffect(() => {
    if (open) setVisibility(defaultVisibility);
  }, [defaultVisibility, open]);

  useEffect(() => {
    if (!open) {
      setLabel("");
      setPath("");
      setVisibility(defaultVisibility);
      setWriter("none");
      setError(null);
      setSaving(false);
      setDetected(null);
    }
  }, [defaultVisibility, open]);

  useEffect(() => {
    const trimmed = path.trim();
    if (!trimmed) {
      setDetected(null);
      return;
    }
    const seq = ++detectSeqRef.current;
    void (async () => {
      try {
        const result = await detectWorkspace(trimmed);
        if (seq === detectSeqRef.current) setDetected(result);
      } catch {
        if (seq === detectSeqRef.current) setDetected(null);
      }
    })();
  }, [path]);

  async function pickFolder() {
    setError(null);
    try {
      const selected = await chooseWorkspaceDirectory(t("workspace.dialog.title"));
      if (selected) {
        setPath(selected);
        if (!label.trim()) {
          const segments = selected.split(/[/\\]/);
          const tail =
            segments[segments.length - 1] || segments[segments.length - 2] || "workspace";
          setLabel(tail);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submit() {
    setError(null);
    if (!label.trim()) {
      setError(t("workspace.dialog.error.label"));
      return;
    }
    if (!path.trim()) {
      setError(t("workspace.dialog.error.path"));
      return;
    }
    setSaving(true);
    try {
      const ext = writer === "obsidian" ? "mcp-obsidian" : null;
      await onAdd(label.trim(), path.trim(), visibility, ext);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function registerWorkspaceConfig() {
    setError(null);
    if (!path.trim()) {
      setError(t("workspace.dialog.error.path"));
      return;
    }
    setSaving(true);
    try {
      await onRegisterWorkspace(path.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const ownerName = detected?.config.owner?.name ?? null;
  const privatePath = detected?.resolvedPrivatePath ?? null;
  const publicPath = detected?.resolvedPublicPath ?? null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-header">
            <div>
              <Dialog.Title>{t("workspace.dialog.title")}</Dialog.Title>
              <Dialog.Description>{t("workspace.dialog.description")}</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" title={t("app.errorClose")}>
              <X size={16} />
            </Dialog.Close>
          </div>

          <Field label={t("workspace.dialog.path")} error={error ?? undefined}>
            <div className="select-row">
              <TextInput
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="/Users/.../workspace"
              />
              <Button variant="secondary" onClick={pickFolder} icon={<FolderOpen size={14} />}>
                {t("workspace.dialog.pickPath")}
              </Button>
            </div>
          </Field>

          {detected ? (
            <div className="workspace-detect-card">
              <div className="workspace-detect-title">
                <Link2 size={14} />
                <strong>{t("workspace.detected")}</strong>
              </div>
              <div className="workspace-detect-meta">
                {ownerName ? (
                  <div>
                    <span className="muted">{t("workspace.owner")}</span>
                    <span>{ownerName}</span>
                  </div>
                ) : null}
                <div>
                  <span className="muted">{t("workspace.visibility.private")}</span>
                  <span>
                    {privatePath}
                    {!detected.resolvedPrivateExists ? (
                      <em className="warn"> · {t("workspace.path.missing")}</em>
                    ) : null}
                  </span>
                </div>
                {publicPath ? (
                  <div>
                    <span className="muted">{t("workspace.visibility.public")}</span>
                    <span>
                      {publicPath}
                      {!detected.resolvedPublicExists ? (
                        <em className="warn"> · {t("workspace.path.missing")}</em>
                      ) : null}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="muted">{t("workspace.visibility.public")}</span>
                    <em>{t("workspace.public.optional")}</em>
                  </div>
                )}
              </div>
              <p className="workspace-detect-hint">{t("workspace.detect.hint")}</p>
              <div className="dialog-actions">
                <Button variant="ghost" onClick={() => setDetected(null)}>
                  {t("workspace.detect.useStandalone")}
                </Button>
                <Button
                  variant="primary"
                  onClick={registerWorkspaceConfig}
                  disabled={saving}
                  icon={<FolderPlus size={15} />}
                >
                  {t("workspace.detect.register")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Field label={t("workspace.dialog.visibility")}>
                <div className="select-row">
                  <button
                    type="button"
                    className={visibility === "private" ? "chip active" : "chip"}
                    onClick={() => setVisibility("private")}
                  >
                    {t("workspace.visibility.private")}
                  </button>
                  <button
                    type="button"
                    className={visibility === "public" ? "chip active" : "chip"}
                    onClick={() => setVisibility("public")}
                  >
                    {t("workspace.visibility.public")}
                  </button>
                </div>
              </Field>

              <Field label={t("workspace.dialog.label")}>
                <TextInput
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="e.g. Work, Public Notes"
                />
              </Field>

              <Field
                label={t("workspace.dialog.externalWriter")}
                helper={t("workspace.dialog.externalWriter.help")}
              >
                <div className="select-row">
                  <button
                    type="button"
                    className={writer === "none" ? "chip active" : "chip"}
                    onClick={() => setWriter("none")}
                  >
                    {t("workspace.dialog.externalWriter.none")}
                  </button>
                  <button
                    type="button"
                    className={writer === "obsidian" ? "chip active" : "chip"}
                    onClick={() => setWriter("obsidian")}
                  >
                    {t("workspace.dialog.externalWriter.obsidian")}
                  </button>
                </div>
              </Field>

              <div className="dialog-actions">
                <Dialog.Close asChild>
                  <Button variant="ghost">{t("workspace.dialog.cancel")}</Button>
                </Dialog.Close>
                <Button
                  variant="primary"
                  onClick={submit}
                  disabled={saving}
                  icon={<FolderPlus size={15} />}
                >
                  {t("workspace.dialog.confirm")}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
