"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { ReactNode, useState } from "react";

export type ResponsiveColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  mobileLabel?: string;
  hideFromDetails?: boolean;
};

export function ResponsiveTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  mobileTitle,
  mobileSummary,
  rowClassName
}: {
  caption: string;
  rows: T[];
  columns: ResponsiveColumn<T>[];
  rowKey: (row: T, index: number) => string;
  mobileTitle: (row: T) => ReactNode;
  mobileSummary?: (row: T) => ReactNode;
  rowClassName?: (row: T) => string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <div className="responsive-table-desktop table-wrap">
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr className={rowClassName?.(row)} key={rowKey(row, index)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="responsive-table-mobile" role="list" aria-label={caption}>
        {rows.map((row, index) => {
          const key = rowKey(row, index);
          const isExpanded = expanded === key;
          return <article className={`mobile-data-row ${rowClassName?.(row) ?? ""}`} key={key} role="listitem">
            <button aria-expanded={isExpanded} className="mobile-row-toggle" onClick={() => setExpanded(isExpanded ? null : key)} type="button">
              <span><strong>{mobileTitle(row)}</strong>{mobileSummary ? <small>{mobileSummary(row)}</small> : null}</span>
              {isExpanded ? <ChevronUp aria-hidden="true" size={18} /> : <ChevronDown aria-hidden="true" size={18} />}
            </button>
            {isExpanded ? <dl className="mobile-row-details">{columns.filter((column) => !column.hideFromDetails).map((column) => <div key={column.key}><dt>{column.mobileLabel ?? column.label}</dt><dd>{column.render(row)}</dd></div>)}</dl> : null}
          </article>;
        })}
      </div>
    </>
  );
}
