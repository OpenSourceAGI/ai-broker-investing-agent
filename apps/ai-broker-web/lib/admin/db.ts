import { db } from "@/lib/db";

/** The drizzle handle the admin modules take, so they can be given a fixture in tests. */
export type AdminDB = typeof db;

export const getAdminDB = (): AdminDB => db;
