import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input, Select } from "@harness-kit/ui";

// The shared fields render their helper text under the control. Unless it is
// wired as the control's description, a screen reader announces "Name, edit
// text, invalid" and never the message saying what is wrong.
describe("@harness-kit/ui field helper text", () => {
  it("is the Input's accessible description, and the Input is marked invalid on error", () => {
    render(<Input label="Name" error helperText="Enter a name for this server." />);
    const field = screen.getByLabelText("Name");
    expect(field).toHaveAccessibleDescription("Enter a name for this server.");
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps a caller's own aria-describedby alongside the helper text", () => {
    render(
      <>
        <p id="outside">Shared note.</p>
        <Input label="URL" aria-describedby="outside" helperText="Must start with https://." />
      </>,
    );
    expect(screen.getByLabelText("URL")).toHaveAccessibleDescription("Shared note. Must start with https://.");
  });

  it("describes nothing when there is no helper text", () => {
    render(<Input label="Command" />);
    const field = screen.getByLabelText("Command");
    expect(field).not.toHaveAttribute("aria-describedby");
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("is the Select's accessible description too", () => {
    render(
      <Select
        label="Type"
        error
        helperText="Pick a transport."
        options={[{ value: "stdio", label: "Command (stdio)" }]}
      />,
    );
    const field = screen.getByLabelText("Type");
    expect(field).toHaveAccessibleDescription("Pick a transport.");
    expect(field).toHaveAttribute("aria-invalid", "true");
  });
});
