import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistryEnrollment } from "../RegistryEnrollment";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

const inventory = {
  version: 1,
  installationId: "desktop-1",
  capturedAt: "2026-08-28T12:00:00.000Z",
  targets: [],
  effectiveConfig: {},
  assignments: [],
  drift: [],
  redactions: [],
} as unknown as Parameters<typeof RegistryEnrollment>[0]["inventory"];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("RegistryEnrollment failures (AC-20)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says a sync couldn't reach the registry, raw error behind Details, and Retry syncs again", async () => {
    sessionStorage.setItem("harness-kit-registry-session", "token-1");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockImplementation(() => json([]));
    render(<RegistryEnrollment inventory={inventory} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't sync with the registry");
    // The raw network text is only in Details, not the status line.
    expect(screen.getByText("Failed to fetch")).not.toBeVisible();
    expect(screen.queryByRole("button", { name: "Refresh assignment" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Authorized, but this identity has no organization membership.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh assignment" })).toBeInTheDocument();
  });

  it("says enrollment failed with the raw error behind Details, leaving Enroll as the retry", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Load failed"));
    render(<RegistryEnrollment inventory={inventory} />);

    fireEvent.click(screen.getByRole("button", { name: "Enroll this device" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't enroll this device");
    expect(screen.getByText("Load failed")).not.toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Enroll this device" })).toBeEnabled());
  });
});
