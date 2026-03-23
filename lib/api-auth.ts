import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type AuthedUser = {
  id: string;
  email?: string | null;
};

export async function requireAuthedUser(req: Request): Promise<AuthedUser> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    throw new Error("Missing Authorization bearer token");
  }

  const admin = getSupabaseAdminClient();

  // Validate JWT and get user
  const { data, error } = await admin.auth.getUser(token);

  if (error || !data?.user) {
    throw new Error("Invalid or expired session");
  }

  return { id: data.user.id, email: data.user.email };
}
