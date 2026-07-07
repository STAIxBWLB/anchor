import { describe, expect, it } from "vitest";
import { normalizeMaruSettings } from "./settings";
import {
  gwsAuthCommand,
  isTelegramMonitorConfigOutsideMaru,
  m365LoginCommand,
  telegramLoginCommand,
} from "./telegram";

describe("telegramLoginCommand", () => {
  it("runs through the user shell and expands tilde paths before quoting", () => {
    const settings = normalizeMaruSettings({
      comms: {
        telegram: {
          pythonPath: "~/.maru/env/.venv/bin/python",
          scriptPath:
            "~/.maru/skills/_builtin/skills/io-telegram/scripts/telegram_monitor.py",
          sessionFile: "~/.maru/telegram/monitor.session",
          monitorConfigPath:
            "~/workspace/work/.maru/secrets/services/telegram-monitor.config.yaml",
        },
      },
    }).comms.telegram;

    const command = telegramLoginCommand(settings);

    expect(command.command).toBeNull();
    expect(command.args[0]).toBe("-lc");
    expect(command.args[1]).toContain(
      '"$HOME/.maru/env/.venv/bin/python"',
    );
    expect(command.args[1]).toContain(
      '"$HOME/.maru/skills/_builtin/skills/io-telegram/scripts/auth.py"',
    );
    expect(command.args[1]).toContain(
      '--session-file "$HOME/.maru/telegram/monitor.session"',
    );
    expect(command.args[1]).toContain(
      '--config-file "$HOME/workspace/work/.maru/secrets/services/telegram-monitor.config.yaml"',
    );
  });
});

describe("provider reauth commands", () => {
  it("quotes explicit gws and m365 paths", () => {
    expect(gwsAuthCommand("/opt/homebrew/bin/gws").args[1]).toBe(
      "exec '/opt/homebrew/bin/gws' auth",
    );
    expect(m365LoginCommand("~/bin/m365").args[1]).toBe(
      'exec "$HOME/bin/m365" login',
    );
  });

  it("escapes shell-active characters inside $HOME-expanded double quotes", () => {
    // A path that tries to break out of the double quotes must stay inert.
    expect(m365LoginCommand('~/x";echo pwned;"').args[1]).toBe(
      'exec "$HOME/x\\";echo pwned;\\"" login',
    );
    expect(m365LoginCommand("~/x$(whoami)`id`").args[1]).toBe(
      'exec "$HOME/x\\$(whoami)\\`id\\`" login',
    );
    expect(gwsAuthCommand("$HOME/bin/g$ws").args[1]).toBe(
      'exec "$HOME/bin/g\\$ws" auth',
    );
  });
});

describe("isTelegramMonitorConfigOutsideMaru", () => {
  it("does not warn for empty or Maru-home monitor config paths", () => {
    expect(isTelegramMonitorConfigOutsideMaru(null)).toBe(false);
    expect(isTelegramMonitorConfigOutsideMaru("")).toBe(false);
    expect(isTelegramMonitorConfigOutsideMaru(" ~/.maru ")).toBe(false);
    expect(isTelegramMonitorConfigOutsideMaru("~/.maru/telegram/config.yaml")).toBe(false);
    expect(isTelegramMonitorConfigOutsideMaru("$HOME/.maru")).toBe(false);
    expect(isTelegramMonitorConfigOutsideMaru("$HOME/.maru/telegram/config.yaml")).toBe(false);
  });

  it("does not warn for absolute paths inside an Maru home directory", () => {
    expect(
      isTelegramMonitorConfigOutsideMaru("/Users/yj.lee/.maru/telegram/config.yaml"),
    ).toBe(false);
    expect(isTelegramMonitorConfigOutsideMaru("/home/foo/.maru")).toBe(false);
  });

  it("does not warn for workspace .maru secrets paths", () => {
    expect(
      isTelegramMonitorConfigOutsideMaru(
        "~/workspace/work/.maru/secrets/services/telegram-monitor.config.yaml",
      ),
    ).toBe(false);
  });

  it("warns for monitor config paths outside Maru-managed paths", () => {
    expect(isTelegramMonitorConfigOutsideMaru("/tmp/telegram-monitor.yaml")).toBe(true);
  });
});
