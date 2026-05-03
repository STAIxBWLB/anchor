import { describe, expect, it } from "vitest";
import { DEFAULT_ANCHOR_SETTINGS, normalizeAnchorSettings } from "./settings";

describe("normalizeAnchorSettings", () => {
  it("returns defaults for invalid or broken input", () => {
    expect(normalizeAnchorSettings(null)).toEqual(DEFAULT_ANCHOR_SETTINGS);
    expect(normalizeAnchorSettings("not-json")).toEqual(DEFAULT_ANCHOR_SETTINGS);
  });

  it("merges partial settings with terminal defaults", () => {
    const settings = normalizeAnchorSettings({
      ui: {
        documentBrowserMode: "tree",
        collapsedTreeFolders: ["projects/rise"],
      },
      terminal: {
        defaultPanelOpen: false,
        lastHeight: 900,
        launchers: {
          codex: {
            enabled: false,
            label: "Local Codex",
          },
        },
      },
    });

    expect(settings.ui.documentBrowserMode).toBe("tree");
    expect(settings.ui.collapsedTreeFolders).toEqual(["projects/rise"]);
    expect(settings.terminal.defaultPanelOpen).toBe(false);
    expect(settings.terminal.lastHeight).toBe(520);
    expect(settings.terminal.launchers.codex.enabled).toBe(false);
    expect(settings.terminal.launchers.codex.label).toBe("Local Codex");
    expect(settings.terminal.launchers.claude.enabled).toBe(true);
    expect(settings.terminal.launchers.shell.enabled).toBe(true);
    expect(settings.ai).toEqual({ providers: {}, defaults: {} });
  });

  it("migrates legacy AI runtime labels into terminal launcher settings", () => {
    const settings = normalizeAnchorSettings({
      ai: {
        runtimes: {
          "claude-code": {
            enabled: false,
            label: "Claude Local",
          },
        },
      },
    });

    expect(settings.terminal.launchers.claude.enabled).toBe(false);
    expect(settings.terminal.launchers.claude.label).toBe("Claude Local");
    expect(settings.ai).toEqual({ providers: {}, defaults: {} });
  });
});
