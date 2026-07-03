import type { ReactNode, TableHTMLAttributes } from "react";

export interface TableColumn<T> {
  id: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Use the mono/tabular data face (file paths, versions, counts). */
  mono?: boolean;
  align?: "left" | "center" | "right";
  width?: string;
}

export interface TableProps<T> extends TableHTMLAttributes<HTMLTableElement> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  isRowSelected?: (row: T) => boolean;
}

/**
 * Dense data table / matrix. Row height 46px (DESIGN.md §4), hover tint via
 * --hover-bg, selected via --accent-light. Suitable for the Fleet matrix
 * (harnesses x scopes) or any list/grid of records.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isRowSelected,
  className = "",
  ...rest
}: TableProps<T>) {
  return (
    <table className={["hk-table", className].filter(Boolean).join(" ")} {...rest}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.id} style={{ textAlign: col.align ?? "left", width: col.width }}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            data-selected={isRowSelected?.(row) ? "true" : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={onRowClick ? { cursor: "pointer" } : undefined}
          >
            {columns.map((col) => (
              <td
                key={col.id}
                className={col.mono ? "hk-table-mono" : undefined}
                style={{ textAlign: col.align ?? "left" }}
              >
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
