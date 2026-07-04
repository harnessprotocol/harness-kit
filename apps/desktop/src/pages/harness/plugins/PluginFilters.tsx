import { Input, Select } from "@harness-kit/ui";

interface PluginFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  categories: string[];
  total: number;
  filtered: number;
}

export default function PluginFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  categories,
  total,
  filtered,
}: PluginFiltersProps) {
  const showCount = search || category;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px",
      marginBottom: "12px",
    }}>
      <div style={{ flex: 1 }}>
        <Input
          type="text"
          placeholder="Search plugins…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div style={{ minWidth: "140px" }}>
        <Select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          options={[
            { value: "", label: "All categories" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />
      </div>
      <span style={{
        fontSize: "11px", color: "var(--fg-subtle)",
        whiteSpace: "nowrap", minWidth: "70px", textAlign: "right",
      }}>
        {showCount ? `${filtered} of ${total}` : `${total}`} plugin{total !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
