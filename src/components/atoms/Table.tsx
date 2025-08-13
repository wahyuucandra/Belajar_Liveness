import * as React from "react";

export function Table({
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-sm text-left border-collapse" {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className="bg-gray-100" {...props}>
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props}>{children}</tbody>;
}

export function TableRow({
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className="border-b last:border-0 hover:bg-gray-50" {...props}>
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className="px-4 py-2 font-medium text-gray-600" {...props}>
      {children}
    </th>
  );
}

export function TableCell({
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className="px-4 py-2 text-gray-800" {...props}>
      {children}
    </td>
  );
}
