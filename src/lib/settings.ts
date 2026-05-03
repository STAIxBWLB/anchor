export type DocumentBrowserMode = "list" | "tree";
export type TerminalLauncherId = "claude" | "codex" | "shell";

export interface TerminalLauncherSettings {
  enabled: boolean;
  label: string;
  command?: string | null;
  args?: string[];
}

export interface AnchorSettings {
  version: 1;
  ui: {
    documentBrowserMode: DocumentBrowserMode;
    collapsedTreeFolders: string[];
  };
  terminal: {
    defaultPanelOpen: boolean;
    lastHeight: number;
    launchers: Record<TerminalLauncherId, TerminalLauncherSettings>;
  };
  ai: Record<string, unknown>;
  inboxChannels: Record<string, unknown>;
  connectors: Record<string, unknown>;
}

export const DEFAULT_ANCHOR_SETTINGS: AnchorSettings = {
  version: 1,
  ui: {
    documentBrowserMode: "tree",
    collapsedTreeFolders: [],
  },
  terminal: {
    defaultPanelOpen: true,
    lastHeight: 260,
    launchers: {
      claude: {
        enabled: true,
        label: "Claude Code",
      },
      codex: {
        enabled: true,
        label: "Codex",
      },
      shell: {
        enabled: true,
        label: "Shell",
      },
    },
  },
  ai: {
    providers: {},
    defaults: {},
  },
  inboxChannels: {},
  connectors: {},
};

export function normalizeAnchorSettings(value: unknown): AnchorSettings {
  if (!isRecord(value)) return cloneDefaultSettings();
  const ui = isRecord(value.ui) ? value.ui : {};
  const terminal = isRecord(value.terminal) ? value.terminal : {};
  const launchers = isRecord(terminal.launchers) ? terminal.launchers : {};
  const legacyAi = isRecord(value.ai) ? value.ai : {};
  const legacyRuntimes = isRecord(legacyAi.runtimes) ? legacyAi.runtimes : {};

  return {
    version: 1,
    ui: {
      documentBrowserMode: parseBrowserMode(ui.documentBrowserMode) ?? "tree",
      collapsedTreeFolders: parseStringArray(ui.collapsedTreeFolders),
    },
    terminal: {
      defaultPanelOpen:
        typeof terminal.defaultPanelOpen === "boolean"
          ? terminal.defaultPanelOpen
          : DEFAULT_ANCHOR_SETTINGS.terminal.defaultPanelOpen,
      lastHeight: normalizeTerminalHeight(terminal.lastHeight),
      launchers: {
        claude: normalizeLauncher(
          launchers.claude ?? legacyRuntimes["claude-code"],
          DEFAULT_ANCHOR_SETTINGS.terminal.launchers.claude,
        ),
        codex: normalizeLauncher(
          launchers.codex ?? legacyRuntimes.codex,
          DEFAULT_ANCHOR_SETTINGS.terminal.launchers.codex,
        ),
        shell: normalizeLauncher(
          launchers.shell,
          DEFAULT_ANCHOR_SETTINGS.terminal.launchers.shell,
        ),
      },
    },
    ai: normalizeFutureAi(value.ai),
    inboxChannels: isRecord(value.inboxChannels) ? value.inboxChannels : {},
    connectors: isRecord(value.connectors) ? value.connectors : {},
  };
}

export function serializeAnchorSettings(settings: AnchorSettings): unknown {
  return normalizeAnchorSettings(settings);
}

function cloneDefaultSettings(): AnchorSettings {
  return {
    ...DEFAULT_ANCHOR_SETTINGS,
    ui: {
      ...DEFAULT_ANCHOR_SETTINGS.ui,
      collapsedTreeFolders: [...DEFAULT_ANCHOR_SETTINGS.ui.collapsedTreeFolders],
    },
    terminal: {
      ...DEFAULT_ANCHOR_SETTINGS.terminal,
      launchers: {
        claude: { ...DEFAULT_ANCHOR_SETTINGS.terminal.launchers.claude },
        codex: { ...DEFAULT_ANCHOR_SETTINGS.terminal.launchers.codex },
        shell: { ...DEFAULT_ANCHOR_SETTINGS.terminal.launchers.shell },
      },
    },
    ai: {
      providers: {},
      defaults: {},
    },
    inboxChannels: {},
    connectors: {},
  };
}

function normalizeLauncher(
  value: unknown,
  fallback: TerminalLauncherSettings,
): TerminalLauncherSettings {
  if (!isRecord(value)) return { ...fallback };
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    label: typeof value.label === "string" && value.label.trim() ? value.label : fallback.label,
    command: typeof value.command === "string" ? value.command : null,
    args: parseStringArray(value.args),
  };
}

function parseBrowserMode(value: unknown): DocumentBrowserMode | null {
  return value === "list" || value === "tree" ? value : null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeTerminalHeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ANCHOR_SETTINGS.terminal.lastHeight;
  }
  return Math.min(520, Math.max(160, Math.round(value)));
}

function normalizeFutureAi(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return { ...DEFAULT_ANCHOR_SETTINGS.ai };
  if (isRecord(value.runtimes) || typeof value.defaultRuntime === "string") {
    return { ...DEFAULT_ANCHOR_SETTINGS.ai };
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
