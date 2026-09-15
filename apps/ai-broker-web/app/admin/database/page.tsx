"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface EditableField {
  name: string;
  label: string;
  type: "string" | "number" | "boolean";
  hint?: string;
}

interface TableDescriptor {
  key: string;
  label: string;
  description: string;
  primaryKey: string;
  columns: string[];
  truncated: string[];
  editable: EditableField[];
  destructive: boolean;
  rows: number;
}

interface MaintenanceDescriptor {
  key: string;
  label: string;
  description: string;
}

interface RegistryResponse {
  tables: TableDescriptor[];
  maintenance: MaintenanceDescriptor[];
}

type Row = Record<string, unknown>;

interface RowsResponse {
  table: Omit<TableDescriptor, "rows">;
  rows: Row[];
  page: number;
  limit: number;
  matchedRows: number;
  pageCount: number;
}

const PAGE_SIZE = 25;

/**
 * Renders a cell without ever printing `[object Object]`: JSON columns come
 * back parsed, and timestamp columns come back as an ISO string or a number of
 * seconds depending on the drizzle mode.
 */
function renderCell(value: unknown, truncate: boolean) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/40">—</span>;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (truncate && text.length > 60) return <span title={text}>{text.slice(0, 60)}…</span>;
  return text;
}

function RowEditor({
  table,
  row,
  onClose,
  onChanged,
}: {
  table: Omit<TableDescriptor, "rows">;
  row: Row;
  onClose: () => void;
  onChanged: (row: Row | null) => void;
}) {
  const id = String(row[table.primaryKey] ?? "");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      table.editable.map((field) => [
        field.name,
        row[field.name] === null || row[field.name] === undefined
          ? ""
          : String(row[field.name]),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/database/${table.key}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      onChanged(body.row as Row);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/database/${table.key}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      onChanged(null);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // A destructive table cascades into a lot of user-visible data, so the row
  // id has to be retyped before the delete button becomes usable.
  const deleteArmed = !table.destructive || confirmText === id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="bg-background max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border p-6 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold">{table.label} row</h2>
          <p className="text-muted-foreground font-mono text-xs break-all">
            {table.primaryKey} = {id}
          </p>
        </div>

        {table.editable.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This table is read-only. Rows can be inspected and deleted, but not edited.
          </p>
        ) : (
          <div className="space-y-3">
            {table.editable.map((field) => (
              <label key={field.name} className="block">
                <span className="text-muted-foreground text-xs font-medium">{field.label}</span>
                {field.type === "boolean" ? (
                  <select
                    className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-1.5 text-sm"
                    value={values[field.name] === "true" ? "true" : "false"}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    value={values[field.name] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                  />
                )}
                {field.hint && (
                  <span className="text-muted-foreground text-xs">{field.hint}</span>
                )}
              </label>
            ))}
          </div>
        )}

        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer">Full row</summary>
          <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-[11px]">
            {JSON.stringify(row, null, 2)}
          </pre>
        </details>

        {error && <p className="text-destructive font-mono text-sm">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-2">
          {confirmDelete ? (
            <div className="flex flex-1 items-center gap-2">
              {table.destructive && (
                <Input
                  placeholder={`Type ${id} to confirm`}
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  className="min-w-0 flex-1 text-xs"
                />
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={remove}
                disabled={saving || !deleteArmed}
              >
                Delete row
              </Button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-muted-foreground text-xs hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-destructive text-sm hover:underline"
            >
              Delete row
            </button>
          )}

          {table.editable.length > 0 && !confirmDelete && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminDatabasePage() {
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<RowsResponse | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadRegistry = useCallback(async () => {
    setRegistryError(null);
    try {
      const res = await fetch("/api/admin/database");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setRegistry(body);
    } catch (e) {
      setRegistryError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadRows = useCallback(async () => {
    if (!selected) return;
    setLoadingRows(true);
    setRowsError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set("q", debouncedSearch);
      const res = await fetch(`/api/admin/database/${selected}?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setRows(body);
    } catch (e) {
      setRowsError((e as Error).message);
    } finally {
      setLoadingRows(false);
    }
  }, [selected, page, debouncedSearch]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  async function runMaintenance(key: string, label: string) {
    setRunning(key);
    setActionError(null);
    setActionResult(null);
    try {
      const res = await fetch("/api/admin/database/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: key }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.details ?? body?.error ?? `HTTP ${res.status}`);
      setActionResult(
        `${label}: ${
          body.detail ??
          `${Number(body.affected ?? 0).toLocaleString()} row${body.affected === 1 ? "" : "s"} affected`
        }`,
      );
      // Counts moved, so the table grid is stale — and so is the open table.
      await Promise.all([loadRegistry(), loadRows()]);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setRunning(null);
    }
  }

  function onRowChanged(updated: Row | null) {
    if (!rows || !editing) return;
    const pk = rows.table.primaryKey;
    setRows(
      updated
        ? {
            ...rows,
            rows: rows.rows.map((r) => (r[pk] === editing[pk] ? { ...r, ...updated } : r)),
          }
        : {
            ...rows,
            rows: rows.rows.filter((r) => r[pk] !== editing[pk]),
            matchedRows: rows.matchedRows - 1,
          },
    );
    loadRegistry();
  }

  function selectTable(key: string) {
    setSelected((current) => (current === key ? null : key));
    setRows(null);
    setPage(1);
    setSearch("");
    setDebouncedSearch("");
  }

  const table = rows?.table;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription>
            Direct read and write access to the application tables, for admins only. Only the
            fields listed as editable can be written — everything else here is read-and-delete.
            Broker credentials, API keys, OAuth tokens and password hashes are in no view.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {registryError && <p className="text-destructive font-mono text-sm">{registryError}</p>}

          {/* Table picker with live row counts. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {(registry?.tables ?? []).map((entry) => (
              <button
                key={entry.key}
                onClick={() => selectTable(entry.key)}
                title={entry.description}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected === entry.key ? "border-primary bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <div className="text-lg font-semibold tabular-nums">
                  {entry.rows.toLocaleString()}
                </div>
                <div className="text-muted-foreground truncate text-xs">{entry.label}</div>
                <div className="text-muted-foreground/60 text-[10px]">
                  {entry.editable.length > 0 ? `${entry.editable.length} editable` : "read-only"}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Maintenance</CardTitle>
          <CardDescription>
            Each action only touches rows that are already dead — expired, or read and old — or
            recomputes a cached number from the rows it summarises, so running one twice is a
            no-op.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(registry?.maintenance ?? []).map((action) => (
              <Button
                key={action.key}
                variant="outline"
                size="sm"
                onClick={() => runMaintenance(action.key, action.label)}
                disabled={running !== null}
                title={action.description}
              >
                {running === action.key ? "Running…" : action.label}
              </Button>
            ))}
          </div>
          {actionResult && <p className="text-xs text-emerald-600">{actionResult}</p>}
          {actionError && <p className="text-destructive font-mono text-xs">{actionError}</p>}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{table?.label ?? selected}</CardTitle>
            <CardDescription>{table?.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search rows…"
                className="max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={loadRows} disabled={loadingRows}>
                {loadingRows ? "Loading…" : "Refresh"}
              </Button>
              {rows && (
                <span className="text-muted-foreground text-sm">
                  {rows.matchedRows.toLocaleString()} matching
                </span>
              )}
            </div>

            {rowsError && <p className="text-destructive font-mono text-sm">{rowsError}</p>}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    {(table?.columns ?? []).map((column) => (
                      <th key={column} className="px-3 py-2 font-normal whitespace-nowrap">
                        {column}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {!rows || rows.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={(table?.columns.length ?? 1) + 1}
                        className="text-muted-foreground py-6 text-center text-sm"
                      >
                        {loadingRows ? "Loading…" : "No rows match this filter."}
                      </td>
                    </tr>
                  ) : (
                    rows.rows.map((row, index) => (
                      <tr
                        key={String(row[rows.table.primaryKey] ?? index)}
                        className="hover:bg-accent/40 border-b transition-colors"
                      >
                        {rows.table.columns.map((column) => (
                          <td
                            key={column}
                            className="max-w-[280px] truncate px-3 py-2 text-xs whitespace-nowrap"
                          >
                            {renderCell(row[column], rows.table.truncated.includes(column))}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => setEditing(row)}
                            className="text-primary text-xs hover:underline"
                          >
                            {rows.table.editable.length > 0 ? "Edit" : "Inspect"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {rows && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Page {rows.page} of {rows.pageCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((current) => Math.max(current - 1, 1))}
                    disabled={loadingRows || page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={loadingRows || page >= rows.pageCount}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {editing && table && (
        <RowEditor
          table={table}
          row={editing}
          onClose={() => setEditing(null)}
          onChanged={onRowChanged}
        />
      )}
    </div>
  );
}
