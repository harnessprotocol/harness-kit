import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { DriftRedirect } from "../DriftRedirect";

function Probe() {
  const { pathname, search } = useLocation();
  return <div data-testid="probe">{pathname + search}</div>;
}

describe("DriftRedirect", () => {
  it("lands on Machine's Drift view and keeps the harness filter", () => {
    render(
      <MemoryRouter initialEntries={["/drift?harness=claude-code"]}>
        <Routes>
          <Route path="/drift" element={<DriftRedirect />} />
          <Route path="/machine" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("/machine?harness=claude-code&view=drift");
  });

  it("selects the Drift view when there is no query at all", () => {
    render(
      <MemoryRouter initialEntries={["/drift"]}>
        <Routes>
          <Route path="/drift" element={<DriftRedirect />} />
          <Route path="/machine" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("/machine?view=drift");
  });
});
