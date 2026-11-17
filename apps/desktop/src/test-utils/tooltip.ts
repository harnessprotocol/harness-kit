import { fireEvent, screen } from "@testing-library/react";

/** Hover an element, wait out the tooltip delay, return the tooltip text, then leave. */
export async function tooltipText(el: Element): Promise<string> {
  fireEvent.mouseEnter(el);
  const tip = await screen.findByRole("tooltip", {}, { timeout: 2000 });
  const text = tip.textContent ?? "";
  fireEvent.mouseLeave(el);
  return text;
}
