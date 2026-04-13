export interface ViewModeOption {
  key: string;
  label: string;
}

export function getAvailableViewModes(
  filePath: string | null,
  isHarnessYaml?: boolean,
): ViewModeOption[] {
  if (isHarnessYaml) {
    return [
      { key: "formatted", label: "Formatted" },
      { key: "raw", label: "Raw" },
      { key: "editor", label: "Editor" },
    ];
  }

  if (filePath && isMarkdownFile(filePath)) {
    return [
      { key: "formatted", label: "Formatted" },
      { key: "editor", label: "Editor" },
      { key: "split", label: "Split" },
    ];
  }

  return [{ key: "editor", label: "Editor" }];
}

export function getDefaultViewMode(filePath: string | null, isHarnessYaml?: boolean): string {
  if (isHarnessYaml) return "formatted";
  if (filePath && isMarkdownFile(filePath)) return "formatted";
  return "editor";
}

function isMarkdownFile(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".mdx");
}
