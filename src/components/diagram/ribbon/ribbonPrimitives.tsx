import type { ReactNode } from "react";

import { useTranslation } from "../../../lib/i18n";

export interface RibbonGroupProps {
  labelKey: string;
  children: ReactNode;
}

export function RibbonGroup({ labelKey, children }: RibbonGroupProps) {
  const { t } = useTranslation();
  return (
    <div className="maru-diagram-ribbon-group" role="group" aria-label={t(labelKey)}>
      <div className="maru-diagram-ribbon-group-body">{children}</div>
      <div className="maru-diagram-ribbon-group-label">{t(labelKey)}</div>
    </div>
  );
}

export interface RibbonButtonProps {
  labelKey?: string;
  title?: string;
  ariaLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  icon?: ReactNode;
  variant?: "default" | "primary";
  children?: ReactNode;
}

export function RibbonButton({
  labelKey,
  title,
  ariaLabel,
  onClick,
  disabled,
  active,
  icon,
  variant = "default",
  children,
}: RibbonButtonProps) {
  const { t } = useTranslation();
  const label = labelKey ? t(labelKey) : "";
  return (
    <button
      type="button"
      className={`maru-diagram-ribbon-button${active ? " is-active" : ""}${variant === "primary" ? " is-primary" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={ariaLabel ?? label}
    >
      {icon ? <span className="maru-diagram-ribbon-button-icon">{icon}</span> : null}
      {children ?? (label ? <span className="maru-diagram-ribbon-button-label">{label}</span> : null)}
    </button>
  );
}

export function RibbonSeparator() {
  return <span className="maru-diagram-ribbon-sep" aria-hidden="true" />;
}

export function RibbonStack({ children }: { children: ReactNode }) {
  return <div className="maru-diagram-ribbon-stack">{children}</div>;
}

export function RibbonRow({ children }: { children: ReactNode }) {
  return <div className="maru-diagram-ribbon-row">{children}</div>;
}

export function RibbonEmptyTab({ messageKey }: { messageKey: string }) {
  const { t } = useTranslation();
  return <div className="maru-diagram-ribbon-empty">{t(messageKey)}</div>;
}
