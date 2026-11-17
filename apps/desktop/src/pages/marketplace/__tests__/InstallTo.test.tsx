import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SURFACES } from "@harness-kit/core";
import type { SurfaceDescriptor } from "@harness-kit/core";
import type { MarketplacePlugin } from "@harness-kit/marketplace-data";
import { InstallCard } from "../components/InstallTo";
import {
  buildCatalogInstallPrompt,
  identityFromInstallCommand,
  installTargets,
  planCatalogInstall,
} from "../../../lib/marketplace/install-to";

const toast = vi.fn();
const applyMock = vi.fn();
const grantMock = vi.fn();
const whichMock = vi.fn();
let project: string | null = null;

// A registry of three: a native installer, a surface with a plugin store but
// no installer, and a surface that lists plugins as not-applicable.
const base = SURFACES.find((s) => s.id === "claude-code") as SurfaceDescriptor;
const REGISTRY: SurfaceDescriptor[] = [
  base,
  {
    ...base,
    id: "cursor",
    label: "Cursor",
    pluginInstall: undefined,
    detect: [{ scope: "user", path: ".cursor-missing" }],
  },
  { ...base, id: "pi", label: "Pi", notApplicable: ["plugin"] },
];

vi.mock("../../../lib/marketplace/install-to", async (importActual) => ({
  ...(await importActual<typeof import("../../../lib/marketplace/install-to")>()),
  applyCatalogInstall: (...args: unknown[]) => applyMock(...args),
}));
vi.mock("../../../lib/process-runner", () => ({
  TauriProcessRunner: class {
    which(command: string) {
      return whichMock(command);
    }
  },
}));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: async () => "/home/test" }));
vi.mock("../../../lib/definitions", () => ({
  resolveDesktopDefinitions: async () => ({ surfaces: REGISTRY }),
}));
vi.mock("../../../lib/harness-fs", () => ({
  TauriFsProvider: class {
    joinPath(...parts: string[]) {
      return parts.join("/");
    }
    async exists(path: string) {
      return !path.includes("missing");
    }
    async readFile() {
      return "{}";
    }
  },
}));
vi.mock("../../../lib/project-dir", () => ({
  useProjectDir: () => [project, () => {}],
  grantProjectDir: (...args: unknown[]) => grantMock(...args),
}));
vi.mock("../../../components/ToastProvider", () => ({ useToast: () => toast }));

const plugin = {
  name: "Research",
  slug: "research",
  installCommand: "/plugin install research@harness-kit",
  skills: [],
} as unknown as MarketplacePlugin;
const SOURCE = { marketplaceName: "harness-kit", marketplaceSource: "harnessprotocol/harness-kit" };

const writeText = vi.fn(async () => {});

beforeEach(() => {
  project = null;
  toast.mockClear();
  applyMock.mockReset();
  grantMock.mockReset();
  grantMock.mockResolvedValue(true);
  whichMock.mockReset();
  whichMock.mockResolvedValue("/usr/local/bin/claude");
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

describe("install command copy", () => {
  it("copies the catalog install command and toasts", async () => {
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy install command" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(plugin.installCommand));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Install command copied" })),
    );
  });
});

describe("Install to picker", () => {
  it("lists surfaces with a plugin store, drops not-applicable ones, marks undetected", async () => {
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    const select = (await screen.findByLabelText("Surface")) as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
        "Claude Code",
        "Cursor (not detected)",
      ]),
    );
  });

  it("offers project scope only with a project selected", async () => {
    const { unmount } = render(<InstallCard plugin={plugin} {...SOURCE} />);
    await screen.findByLabelText("Surface");
    expect(screen.queryByLabelText("Scope")).toBeNull();
    unmount();
    project = "/work/app";
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    expect(await screen.findByLabelText("Scope")).toBeInTheDocument();
  });

  it("supported surface: CLI, prompt and an enabled Apply", async () => {
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    const cli = await screen.findByTestId("install-cli");
    expect(cli.textContent).toContain("claude plugin install research@harness-kit");
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    expect(screen.queryByTestId("apply-blocked")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy CLI command" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(cli.textContent));
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("research@harness-kit")),
    );
  });

  it("unsupported surface: no CLI, Apply disabled with the reason, prompt still copies", async () => {
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    const select = (await screen.findByLabelText("Surface")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "cursor" } });
    await waitFor(() => expect(screen.queryByTestId("install-cli")).toBeNull());
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy CLI command" })).toBeDisabled();
    expect(screen.getByTestId("apply-blocked").textContent).toMatch(/no plugin installer/);
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });
});

describe("Apply", () => {
  it("shows Installing…, disables Apply until resolved, then toasts success", async () => {
    let resolve!: (value: unknown) => void;
    applyMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    await screen.findByTestId("install-cli");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const busy = await screen.findByRole("button", { name: "Installing…" });
    expect(busy).toBeDisabled();
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0]![0]).toMatchObject({
      marketplaceName: "harness-kit",
      marketplaceSource: "harnessprotocol/harness-kit",
      home: "/home/test",
    });
    await act(async () => {
      resolve({ status: "installed", display: "claude plugin install", files: [] });
    });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Installed Research on Claude Code", variant: "success" }),
      ),
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  it("an unpack success toast carries the outcome note", async () => {
    applyMock.mockResolvedValue({
      status: "installed",
      display: "unpack",
      files: ["a"],
      details: { note: "Only SKILL.md files were written." },
    });
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    await screen.findByTestId("install-cli");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Only SKILL.md files were written." }),
      ),
    );
  });

  it("failure toast names the plugin, surface and reason", async () => {
    applyMock.mockResolvedValue({ status: "failed", reason: "network down" });
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    await screen.findByTestId("install-cli");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't install Research on Claude Code",
          message: "network down",
          variant: "warning",
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  it("a refused outcome toasts a warning with the reason", async () => {
    applyMock.mockResolvedValue({ status: "refused", reason: "claude is not installed" });
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    await screen.findByTestId("install-cli");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ message: "claude is not installed", variant: "warning" }),
      ),
    );
  });

  it("a thrown error is reported, not swallowed", async () => {
    applyMock.mockRejectedValue(new Error("bridge down"));
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    await screen.findByTestId("install-cli");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "bridge down" })),
    );
  });
});

describe("Apply: project scope grant", () => {
  const pickProject = async () => {
    project = "/work/app";
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    const scope = (await screen.findByLabelText("Scope")) as HTMLSelectElement;
    fireEvent.change(scope, { target: { value: "project" } });
    await screen.findByTestId("install-cli");
  };

  it("awaits the project grant before the install runs", async () => {
    const order: string[] = [];
    let release!: (ok: boolean) => void;
    grantMock.mockImplementation(() => {
      order.push("grant");
      return new Promise<boolean>((r) => (release = r));
    });
    applyMock.mockImplementation(async () => {
      order.push("apply");
      return { status: "installed", display: "x", files: [] };
    });
    await pickProject();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(grantMock).toHaveBeenCalledWith("/work/app"));
    expect(applyMock).not.toHaveBeenCalled();
    await act(async () => release(true));
    await waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["grant", "apply"]);
  });

  it("a refused grant stops the install with a reopen-the-folder warning", async () => {
    grantMock.mockResolvedValue(false);
    await pickProject();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Couldn't install Research on Claude Code",
        message: "Reopen the project folder, then try again.",
        variant: "warning",
      }),
    );
    expect(applyMock).not.toHaveBeenCalled();
  });
});

describe("Apply: binary probe (AC-9)", () => {
  it("binary on PATH: Apply is enabled", async () => {
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    await screen.findByTestId("install-cli");
    await waitFor(() => expect(whichMock).toHaveBeenCalledWith("claude"));
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    expect(screen.queryByTestId("apply-blocked")).toBeNull();
  });

  it("binary missing: Apply is disabled with the not-installed reason", async () => {
    whichMock.mockResolvedValue(null);
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    const blocked = await screen.findByTestId("apply-blocked");
    expect(blocked.textContent).toBe(
      "claude is not installed or not on PATH. Copy the CLI command or the agent prompt instead.",
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("ignores a stale probe result after the surface changes", async () => {
    let late!: (v: string | null) => void;
    whichMock
      .mockReturnValueOnce(new Promise((r) => (late = r)))
      .mockReturnValue(new Promise(() => {}));
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    await screen.findByTestId("install-cli");
    const select = screen.getByLabelText("Surface") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "cursor" } });
    await waitFor(() => expect(screen.queryByTestId("install-cli")).toBeNull());
    fireEvent.change(select, { target: { value: "claude-code" } });
    await screen.findByTestId("install-cli");
    await act(async () => late(null));
    // The first probe was superseded; the second (never resolved) decides.
    expect(whichMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });
});

describe("failure toast files", () => {
  it("lists files a failed unpack already wrote", async () => {
    applyMock.mockResolvedValue({
      status: "failed",
      reason: "unpacking a@b stopped: disk full",
      files: ["/h/.claude/skills/x/SKILL.md", "/h/.claude/skills/y/SKILL.md"],
    });
    render(<InstallCard plugin={plugin} {...SOURCE} />);
    await screen.findByTestId("install-cli");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            "unpacking a@b stopped: disk full\nAlready written: /h/.claude/skills/x/SKILL.md, /h/.claude/skills/y/SKILL.md",
        }),
      ),
    );
  });
});

describe("install-to helpers", () => {
  it("parses the identity and filters targets", () => {
    expect(identityFromInstallCommand("/plugin install a@b")).toBe("a@b");
    expect(identityFromInstallCommand("npm i foo")).toBeNull();
    expect(installTargets(REGISTRY).map((s) => s.id)).toEqual(["claude-code", "cursor"]);
  });

  it("plans a project-scope install only with a project root", () => {
    const view = planCatalogInstall({
      surface: base,
      identity: "a@b",
      scope: "project",
      projectRoot: null,
      registry: REGISTRY,
      label: "Claude Code",
    });
    expect(view.cli).toBeNull();
    expect(view.applyBlockedReason).toMatch(/project directory/);
  });

  it("builds the prompt", () => {
    const text = buildCatalogInstallPrompt({
      identity: "a@b",
      surfaceLabel: "Claude Code",
      scope: "user",
      invocation: "claude plugin install a@b",
    });
    expect(text).toContain("Install the plugin `a@b` on Claude Code at user scope");
    expect(text).toContain("claude plugin install a@b");
    expect(text).toContain("Never hand-edit the install record");
    expect(
      buildCatalogInstallPrompt({ identity: "a@b", surfaceLabel: "X", scope: "user", invocation: null }),
    ).not.toContain("installer invocation");
  });
});
