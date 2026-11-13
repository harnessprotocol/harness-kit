import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingFlow } from "../OnboardingFlow";

// AC-61: onboarding covers the whole window, so it is a modal dialog: focus
// starts inside it and Tab cannot reach the app behind.
describe("OnboardingFlow as a modal shell", () => {
  it("is a named modal dialog that takes focus and keeps Tab inside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>app behind</button>
        <OnboardingFlow
          step="scan"
          scanSeconds={null}
          scanError={null}
          reveal={null}
          harnessYaml={null}
          writing={false}
          writeError={null}
          onAdvance={vi.fn()}
          onWriteAndFinish={vi.fn()}
          onExploreReadOnly={vi.fn()}
          onSkip={vi.fn()}
          onRetry={vi.fn()}
        />
      </>,
    );
    const dialog = screen.getByRole("dialog", { name: "Set up Harness Kit" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(dialog).toHaveFocus());
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});
