/**
 * Injects the canonical Direction A token blocks (from @harness-kit/design-tokens)
 * as a <style> tag, so the gallery never hand-copies token values and can't drift
 * from the real app.css / global.css output.
 */
import { palette, cssVarBlock } from "@harness-kit/design-tokens";

export function injectTokens() {
  const style = document.createElement("style");
  style.textContent = `
:root {
${cssVarBlock(palette.light)}
  --success: #3FB07A; --success-light: rgba(63,176,122,0.10);
  --warning: #E0A33D; --warning-light: rgba(224,163,61,0.10);
  --danger: #F2555A; --danger-light: rgba(242,85,90,0.10);
  --hover-bg: rgba(20,15,10,0.04);
  --active-bg: rgba(20,15,10,0.07);
  --shadow-sm: 0 1px 2px rgba(20,15,10,.08);
  --shadow-md: 0 8px 24px -8px rgba(20,15,10,.14);
  --shadow-lg: 0 18px 48px -16px rgba(20,15,10,.18);
}
.dark {
${cssVarBlock(palette.dark)}
  --success: #3FB07A; --success-light: rgba(63,176,122,0.16);
  --warning: #E0A33D; --warning-light: rgba(224,163,61,0.16);
  --danger: #F2555A; --danger-light: rgba(242,85,90,0.16);
  --hover-bg: rgba(255,255,255,0.04);
  --active-bg: rgba(255,255,255,0.07);
  --shadow-sm: 0 1px 2px rgba(0,0,0,.4);
  --shadow-md: 0 6px 20px -6px rgba(0,0,0,.55);
  --shadow-lg: 0 16px 40px -12px rgba(0,0,0,.6);
}
body {
  background: var(--bg-base);
  color: var(--fg-base);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  margin: 0;
}
`;
  document.head.appendChild(style);
}
