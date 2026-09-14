import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { FleetRedirect } from "../FleetRedirect";

function Probe() {
  const { pathname, search } = useLocation();
  return <div data-testid="probe">{pathname + search}</div>;
}

describe("FleetRedirect", () => {
  it("lands on Machine and keeps the harness filter", () => {
    render(
      <MemoryRouter initialEntries={["/fleet?harness=claude-code"]}>
        <Routes>
          <Route path="/fleet" element={<FleetRedirect />} />
          <Route path="/machine" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("/machine?harness=claude-code");
  });

  it("lands on plain Machine when there is no query at all", () => {
    render(
      <MemoryRouter initialEntries={["/fleet"]}>
        <Routes>
          <Route path="/fleet" element={<FleetRedirect />} />
          <Route path="/machine" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("/machine");
  });
});
