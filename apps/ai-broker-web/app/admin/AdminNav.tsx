"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/database", label: "Database" },
];

export default function AdminNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="bg-background text-foreground min-h-screen">
      <nav className="bg-muted/40 border-b">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-6 px-6">
          <span className="text-muted-foreground border-r pr-4 text-sm font-semibold">Admin</span>
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-medium transition-colors ${
                pathname === href || pathname.startsWith(href + "/")
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground ml-auto text-xs"
          >
            ← Back to app
          </Link>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
