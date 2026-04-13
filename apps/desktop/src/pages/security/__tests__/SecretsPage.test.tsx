import type { EnvConfigEntry, KeychainSecretInfo } from "@harness-kit/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SecretsPage from "../SecretsPage";

// ── Mocks ─────────────────────────────────────────────────────

const mockListRequiredEnv = vi.fn();
const mockReadEnvConfig = vi.fn();
const mockSetKeychainSecret = vi.fn();
const mockDeleteKeychainSecret = vi.fn();
const mockWriteEnvConfig = vi.fn();

vi.mock("../../../lib/tauri", () => ({
  listRequiredEnv: () => mockListRequiredEnv(),
  readEnvConfig: () => mockReadEnvConfig(),
  setKeychainSecret: (...args: unknown[]) => mockSetKeychainSecret(...args),
  deleteKeychainSecret: (...args: unknown[]) => mockDeleteKeychainSecret(...args),
  writeEnvConfig: (...args: unknown[]) => mockWriteEnvConfig(...args),
}));

// ── Fixtures ──────────────────────────────────────────────────

const SECRET_SET: KeychainSecretInfo = {
  name: "ANTHROPIC_API_KEY",
  description: "Anthropic API key for Claude access",
  required: true,
  isSet: true,
  pluginName: "research",
};

const SECRET_UNSET: KeychainSecretInfo = {
  name: "OPENAI_API_KEY",
  description: "OpenAI API key",
  required: false,
  isSet: false,
  pluginName: "comparator",
};

const SECRET_NO_PLUGIN: KeychainSecretInfo = {
  name: "GITHUB_TOKEN",
  description: "GitHub personal access token",
  required: false,
  isSet: false,
};

const ENV_ENTRY: EnvConfigEntry = {
  name: "HARNESS_LOG_LEVEL",
  description: "Log verbosity level",
  value: "info",
  pluginName: "core",
};

const ENV_ENTRY_NO_PLUGIN: EnvConfigEntry = {
  name: "CUSTOM_ENDPOINT",
  description: "Custom API endpoint override",
  value: "",
};

// ── Helpers ───────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <SecretsPage />
    </MemoryRouter>,
  );
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockListRequiredEnv.mockResolvedValue([]);
  mockReadEnvConfig.mockResolvedValue([]);
  mockSetKeychainSecret.mockResolvedValue(undefined);
  mockDeleteKeychainSecret.mockResolvedValue(undefined);
  mockWriteEnvConfig.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────

describe("SecretsPage — loading state", () => {
  it("shows 'Loading...' before data arrives", () => {
    mockListRequiredEnv.mockReturnValue(new Promise(() => {}));
    mockReadEnvConfig.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("hides 'Loading...' after data loads", async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText("Loading...")).not.toBeInTheDocument());
  });
});

describe("SecretsPage — basic render", () => {
  it("renders without crashing", async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText("Loading...")).not.toBeInTheDocument());
    expect(screen.getByText("Secrets")).toBeInTheDocument();
  });

  it("shows the page description", async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText("Loading...")).not.toBeInTheDocument());
    expect(screen.getByText(/Manage API keys and environment configuration/)).toBeInTheDocument();
  });

  it("shows Secrets Vault section heading", async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText("Loading...")).not.toBeInTheDocument());
    expect(screen.getByText("Secrets Vault")).toBeInTheDocument();
  });

  it("shows Environment Config section heading", async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText("Loading...")).not.toBeInTheDocument());
    expect(screen.getByText("Environment Config")).toBeInTheDocument();
  });
});

describe("SecretsPage — empty state", () => {
  it("shows empty state message when no secrets are configured", async () => {
    renderPage();
    expect(await screen.findByText("No plugins require secrets.")).toBeInTheDocument();
  });

  it("shows install hint in secrets empty state", async () => {
    renderPage();
    expect(await screen.findByText(/Install plugins from the Marketplace/)).toBeInTheDocument();
  });

  it("shows empty state message for env config when none configured", async () => {
    renderPage();
    expect(await screen.findByText("No environment variables configured.")).toBeInTheDocument();
  });
});

describe("SecretsPage — secrets list", () => {
  beforeEach(() => {
    mockListRequiredEnv.mockResolvedValue([SECRET_SET, SECRET_UNSET]);
  });

  it("renders secret names", async () => {
    renderPage();
    expect(await screen.findByText("ANTHROPIC_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
  });

  it("renders secret descriptions", async () => {
    renderPage();
    expect(await screen.findByText("Anthropic API key for Claude access")).toBeInTheDocument();
  });

  it("renders plugin names", async () => {
    renderPage();
    expect(await screen.findByText("research")).toBeInTheDocument();
    expect(screen.getByText("comparator")).toBeInTheDocument();
  });

  it("shows '-' when secret has no plugin", async () => {
    mockListRequiredEnv.mockResolvedValue([SECRET_NO_PLUGIN]);
    renderPage();
    await screen.findByText("GITHUB_TOKEN");
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("shows 'Set' status badge for secrets that are set", async () => {
    renderPage();
    await screen.findByText("ANTHROPIC_API_KEY");
    // The status badge is a <span>, distinct from the "Update" action button
    const setSpan = document.querySelector("span[style*='rgba(22']");
    expect(setSpan?.textContent).toBe("Set");
  });

  it("shows 'Missing' status badge for secrets that are not set", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
  });

  it("shows 'Update' button for secrets that are already set", async () => {
    renderPage();
    await screen.findByText("ANTHROPIC_API_KEY");
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("shows 'Set' button for secrets that are not set", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    expect(screen.getByRole("button", { name: "Set" })).toBeInTheDocument();
  });

  it("shows 'Delete' button only for secrets that are set", async () => {
    renderPage();
    await screen.findByText("ANTHROPIC_API_KEY");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not show 'Delete' button for secrets that are not set", async () => {
    mockListRequiredEnv.mockResolvedValue([SECRET_UNSET]);
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});

describe("SecretsPage — set secret modal", () => {
  beforeEach(() => {
    mockListRequiredEnv.mockResolvedValue([SECRET_UNSET]);
  });

  it("opens a modal when Set button is clicked", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    expect(await screen.findByText(/Set secret: OPENAI_API_KEY/)).toBeInTheDocument();
  });

  it("modal contains a password input", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    expect(screen.getByPlaceholderText("Enter secret value")).toBeInTheDocument();
  });

  it("Save button is disabled when input is empty", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Save button becomes enabled when a value is entered", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    fireEvent.change(screen.getByPlaceholderText("Enter secret value"), {
      target: { value: "sk-test-abc123" },
    });

    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("clicking Save calls setKeychainSecret with name and value", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    fireEvent.change(screen.getByPlaceholderText("Enter secret value"), {
      target: { value: "sk-test-abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockSetKeychainSecret).toHaveBeenCalledWith("OPENAI_API_KEY", "sk-test-abc123");
    });
  });

  it("modal closes after successful save", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    fireEvent.change(screen.getByPlaceholderText("Enter secret value"), {
      target: { value: "sk-test-abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.queryByText(/Set secret:/)).not.toBeInTheDocument();
    });
  });

  it("Cancel button closes the modal without saving", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText(/Set secret:/)).not.toBeInTheDocument();
    });
    expect(mockSetKeychainSecret).not.toHaveBeenCalled();
  });

  it("pressing Escape closes the modal", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText(/Set secret:/)).not.toBeInTheDocument();
    });
  });

  it("status badge updates to Set after saving", async () => {
    renderPage();
    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    fireEvent.change(screen.getByPlaceholderText("Enter secret value"), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.queryByText(/Set secret:/)).not.toBeInTheDocument();
    });
    // The secret that was unset should now show "Set"
    expect(screen.getByText("Set")).toBeInTheDocument();
  });
});

describe("SecretsPage — delete secret", () => {
  beforeEach(() => {
    mockListRequiredEnv.mockResolvedValue([SECRET_SET]);
  });

  it("clicking Delete calls deleteKeychainSecret with the secret name", async () => {
    renderPage();
    await screen.findByText("ANTHROPIC_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteKeychainSecret).toHaveBeenCalledWith("ANTHROPIC_API_KEY");
    });
  });

  it("status badge changes to Missing after deletion", async () => {
    renderPage();
    await screen.findByText("ANTHROPIC_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Missing")).toBeInTheDocument();
    });
  });

  it("Delete button disappears after deletion", async () => {
    renderPage();
    await screen.findByText("ANTHROPIC_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    });
  });
});

describe("SecretsPage — environment config", () => {
  beforeEach(() => {
    mockReadEnvConfig.mockResolvedValue([ENV_ENTRY, ENV_ENTRY_NO_PLUGIN]);
  });

  it("renders env variable names", async () => {
    renderPage();
    expect(await screen.findByText("HARNESS_LOG_LEVEL")).toBeInTheDocument();
    expect(screen.getByText("CUSTOM_ENDPOINT")).toBeInTheDocument();
  });

  it("renders env variable descriptions", async () => {
    renderPage();
    expect(await screen.findByText("Log verbosity level")).toBeInTheDocument();
  });

  it("renders env variable plugin names", async () => {
    renderPage();
    expect(await screen.findByText("core")).toBeInTheDocument();
  });

  it("renders input fields for env variable values", async () => {
    renderPage();
    await screen.findByText("HARNESS_LOG_LEVEL");
    const inputs = screen.getAllByDisplayValue("info");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("shows 'Save All' button when env config changes", async () => {
    renderPage();
    await screen.findByText("HARNESS_LOG_LEVEL");

    const inputs = screen.getAllByDisplayValue("info");
    fireEvent.change(inputs[0], { target: { value: "debug" } });

    expect(await screen.findByRole("button", { name: "Save All" })).toBeInTheDocument();
  });

  it("clicking Save All calls writeEnvConfig", async () => {
    renderPage();
    await screen.findByText("HARNESS_LOG_LEVEL");

    const inputs = screen.getAllByDisplayValue("info");
    fireEvent.change(inputs[0], { target: { value: "debug" } });

    const saveAllBtn = await screen.findByRole("button", { name: "Save All" });
    fireEvent.click(saveAllBtn);

    await waitFor(() => {
      expect(mockWriteEnvConfig).toHaveBeenCalledTimes(1);
    });
  });
});

describe("SecretsPage — error handling", () => {
  it("shows an error banner when setKeychainSecret fails", async () => {
    mockListRequiredEnv.mockResolvedValue([SECRET_UNSET]);
    mockSetKeychainSecret.mockRejectedValue(new Error("Keychain unavailable"));
    renderPage();

    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    fireEvent.change(screen.getByPlaceholderText("Enter secret value"), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Keychain unavailable/)).toBeInTheDocument();
  });

  it("error banner has a dismiss button", async () => {
    mockListRequiredEnv.mockResolvedValue([SECRET_UNSET]);
    mockSetKeychainSecret.mockRejectedValue(new Error("Keychain unavailable"));
    renderPage();

    await screen.findByText("OPENAI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Set" }));

    await screen.findByText(/Set secret: OPENAI_API_KEY/);
    fireEvent.change(screen.getByPlaceholderText("Enter secret value"), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText(/Keychain unavailable/);
    expect(screen.getByRole("button", { name: "dismiss" })).toBeInTheDocument();
  });
});
