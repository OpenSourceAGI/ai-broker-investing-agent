"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean | null;
  usageCount: number | null;
  kycStatus: string | null;
  trialAllowed: boolean | null;
  stripeCustomerId: string | null;
  alpacaPaper: boolean | null;
  createdAt: string;
  lastActiveAt: string | null;
  sessions: number;
  total: number;
  strategies: number;
  watchlists: number;
  tickers: number;
  signals: number;
  positions: number;
  trades: number;
  apiCalls: number;
  comments: number;
  likes: number;
}

interface UsersResponse {
  users: UserRow[];
  page: number;
  limit: number;
  pageCount: number;
  matchedUsers: number;
  totals: Record<string, number>;
}

/**
 * The usage counters, in table order. `key` matches both the API response
 * field and the `sort` parameter it accepts, so a header click maps straight
 * onto a server-side ORDER BY.
 */
const USAGE_COLUMNS = [
  { key: "strategies", label: "Strats", hint: "Trading strategies" },
  { key: "watchlists", label: "Lists", hint: "Watchlist collections" },
  { key: "tickers", label: "Tickers", hint: "Symbols across all watchlists" },
  { key: "signals", label: "Signals", hint: "Scored signals generated" },
  { key: "positions", label: "Positions", hint: "Positions opened" },
  { key: "trades", label: "Trades", hint: "Trades executed" },
  { key: "apiCalls", label: "API", hint: "Agent API calls logged" },
  { key: "comments", label: "Comments", hint: "Comments posted" },
  { key: "likes", label: "Likes", hint: "Likes given" },
] as const;

const SUMMARY_TILES = [
  { key: "users", label: "Users" },
  { key: "sessions", label: "Sessions" },
  { key: "activity", label: "Saved items" },
  ...USAGE_COLUMNS.map(({ key, label }) => ({ key, label })),
] as const;

const PAGE_SIZE = 25;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

/** Compact "how long ago", so dormant accounts stand out while scanning. */
function formatRelative(value: string | null) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Zeroes are dimmed so the columns a user actually uses pop out of the grid. */
function UsageCell({ value }: { value: number }) {
  return value === 0 ? (
    <span className="text-muted-foreground/40">0</span>
  ) : (
    <span>{value.toLocaleString()}</span>
  );
}

function EditUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: (updated: Partial<UserRow> | null) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [emailVerified, setEmailVerified] = useState(Boolean(user.emailVerified));
  const [trialAllowed, setTrialAllowed] = useState(Boolean(user.trialAllowed));
  const [alpacaPaper, setAlpacaPaper] = useState(user.alpacaPaper !== false);
  const [kycStatus, setKycStatus] = useState(user.kycStatus ?? "not_started");
  const [usageCount, setUsageCount] = useState(String(user.usageCount ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          emailVerified,
          trialAllowed,
          alpacaPaper,
          kycStatus,
          usageCount: Number(usageCount),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      onSaved(body.user as Partial<UserRow>);
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
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      onSaved(null);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const toggle = (label: string, value: boolean, set: (next: boolean) => void, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={value}
        onChange={(event) => set(event.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="bg-background max-h-[85vh] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border p-6 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold">Edit user</h2>
          <p className="text-muted-foreground font-mono text-xs break-all">{user.id}</p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-muted-foreground text-xs font-medium">Display name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block">
            <span className="text-muted-foreground text-xs font-medium">Email</span>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block">
            <span className="text-muted-foreground text-xs font-medium">KYC status</span>
            <Input value={kycStatus} onChange={(event) => setKycStatus(event.target.value)} />
            <span className="text-muted-foreground text-xs">
              not_started, pending, in_review, approved, rejected, abandoned, expired
            </span>
          </label>
          <label className="block">
            <span className="text-muted-foreground text-xs font-medium">Usage count</span>
            <Input
              type="number"
              value={usageCount}
              onChange={(event) => setUsageCount(event.target.value)}
            />
          </label>
          {toggle("Email verified", emailVerified, setEmailVerified)}
          {toggle(
            "Trial allowed",
            trialAllowed,
            setTrialAllowed,
            "Whether Stripe checkout grants this account a trial.",
          )}
          {toggle(
            "Alpaca paper trading",
            alpacaPaper,
            setAlpacaPaper,
            "Off means orders reach the live brokerage account.",
          )}
        </div>

        {error && <p className="text-destructive font-mono text-sm">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" onClick={remove} disabled={saving}>
                Really delete
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
              Delete user
            </button>
          )}

          {!confirmDelete && (
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

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [hideUnverified, setHideUnverified] = useState(false);
  const [sort, setSort] = useState("joined");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [editing, setEditing] = useState<UserRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sort,
        dir,
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (hideUnverified) params.set("hideUnverified", "true");
      const res = await fetch(`/api/admin/users?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [page, sort, dir, debouncedSearch, hideUnverified]);

  useEffect(() => {
    load();
  }, [load]);

  /** First click on a column sorts it descending; clicking it again flips. */
  function toggleSort(key: string) {
    if (sort === key) {
      setDir((current) => (current === "desc" ? "asc" : "desc"));
    } else {
      setSort(key);
      setDir(key === "name" || key === "email" ? "asc" : "desc");
    }
    setPage(1);
  }

  function onSaved(updated: Partial<UserRow> | null) {
    if (!data || !editing) return;
    setData(
      updated
        ? {
            ...data,
            users: data.users.map((u) => (u.id === editing.id ? { ...u, ...updated } : u)),
          }
        : {
            ...data,
            users: data.users.filter((u) => u.id !== editing.id),
            matchedUsers: data.matchedUsers - 1,
          },
    );
  }

  const users = data?.users ?? [];
  const pageCount = data?.pageCount ?? 1;

  const headerButton = (key: string, label: string, hint?: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      title={hint}
      className={`hover:text-foreground transition-colors ${
        sort === key ? "text-foreground font-medium" : ""
      }`}
    >
      {label}
      {sort === key ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Every account with what it has actually done — strategies, watchlists, signals,
          positions, trades, agent API calls, comments and likes. Click a column to sort by it
          across all users.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Site-wide totals — deliberately unfiltered, as a stable reference. */}
        {data && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {SUMMARY_TILES.map((tile) => (
              <div key={tile.key} className="rounded-lg border px-2 py-2 text-center">
                <div className="text-lg font-semibold tabular-nums">
                  {(data.totals?.[tile.key] ?? 0).toLocaleString()}
                </div>
                <div className="text-muted-foreground text-xs">{tile.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email or ID…"
            className="max-w-xs"
          />
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideUnverified}
              onChange={(event) => {
                setHideUnverified(event.target.checked);
                setPage(1);
              }}
            />
            Verified only
          </label>
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            {isLoading ? "Loading…" : "Refresh"}
          </Button>
          {data && (
            <span className="text-muted-foreground text-sm">
              {data.matchedUsers.toLocaleString()} matching
            </span>
          )}
        </div>

        {error && <p className="text-destructive font-mono text-sm">{error}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="py-2 pr-3 font-normal">{headerButton("name", "User")}</th>
                <th className="px-2 py-2 font-normal">{headerButton("joined", "Joined")}</th>
                <th className="px-2 py-2 font-normal">
                  {headerButton("lastActive", "Last active", "Newest session activity")}
                </th>
                <th className="px-2 py-2 text-right font-normal">
                  {headerButton("sessions", "Logins", "Session rows for this account")}
                </th>
                {USAGE_COLUMNS.map((column) => (
                  <th key={column.key} className="px-2 py-2 text-right font-normal">
                    {headerButton(column.key, column.label, column.hint)}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-normal">
                  {headerButton("total", "Total", "All saved items combined")}
                </th>
                <th className="py-2 pl-2 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id} className="hover:bg-accent/40 border-b transition-colors">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      {row.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.image}
                          alt=""
                          className="size-7 shrink-0 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs">
                          {(row.name || row.email || "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5 truncate font-medium">
                          {row.name || "—"}
                          {!row.emailVerified && (
                            <Badge variant="outline" className="font-normal">
                              unverified
                            </Badge>
                          )}
                          {row.stripeCustomerId && (
                            <Badge variant="secondary" className="font-normal">
                              stripe
                            </Badge>
                          )}
                          {row.kycStatus === "approved" && (
                            <Badge variant="secondary" className="font-normal">
                              kyc
                            </Badge>
                          )}
                          {row.alpacaPaper === false && (
                            <Badge variant="destructive" className="font-normal">
                              live
                            </Badge>
                          )}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">{row.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="text-muted-foreground px-2 py-2 text-xs whitespace-nowrap">
                    {formatDate(row.createdAt)}
                  </td>
                  <td
                    className="text-muted-foreground px-2 py-2 text-xs whitespace-nowrap"
                    title={row.lastActiveAt ? formatDate(row.lastActiveAt) : undefined}
                  >
                    {formatRelative(row.lastActiveAt)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <UsageCell value={row.sessions} />
                  </td>
                  {USAGE_COLUMNS.map((column) => (
                    <td key={column.key} className="px-2 py-2 text-right tabular-nums">
                      <UsageCell value={row[column.key]} />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right font-medium tabular-nums">
                    <UsageCell value={row.total} />
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <button
                      onClick={() => setEditing(row)}
                      className="text-primary text-xs hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={USAGE_COLUMNS.length + 6}
                    className="text-muted-foreground py-6 text-center text-sm"
                  >
                    {isLoading ? "Loading users…" : "No users match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            Page {data?.page ?? page} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={isLoading || page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => current + 1)}
              disabled={isLoading || page >= pageCount}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>

      {editing && (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            onSaved(updated);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}
