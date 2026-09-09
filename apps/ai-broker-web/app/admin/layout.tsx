import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/auth/admin";
import AdminNav from "./AdminNav";

export const metadata: Metadata = {
  title: "Admin",
};

/**
 * The admin area is gated on the ADMIN_EMAILS allowlist. A signed-out visitor
 * is sent to sign in; a signed-in one who is not on the list is sent home
 * rather than shown a "you are not an admin" page, so the area's existence is
 * not advertised.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, email } = await getAdminAccess();

  if (!isAdmin) {
    redirect(email ? "/" : "/login");
  }

  return <AdminNav>{children}</AdminNav>;
}
