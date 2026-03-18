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
      <input
        type="text"
        placeholder="Search plugins..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          flex: 1,
          fontSize: "12px",
          padding: "6px 10px",
          borderRadius: "6px",
          border: "1px solid var(--border-base)",
          background: "var(--bg-surface)",
          color: "var(--fg-base)",
          outline: "none",
        }}
      />
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        style={{
          fontSize: "12px",
          padding: "6px 10px",
          borderRadius: "6px",
          border: "1px solid var(--border-base)",
          background: "var(--bg-surface)",
          color: "var(--fg-base)",
          outline: "none",
          minWidth: "140px",
        }}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <span style={{
        fontSize: "11px", color: "var(--fg-subtle)",
        whiteSpace: "nowrap", minWidth: "70px", textAlign: "right",
      }}>
        {showCount ? `${filtered} of ${total}` : `${total}`} plugin{total !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
