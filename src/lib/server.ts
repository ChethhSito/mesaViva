import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

let serverClient: SupabaseClient | undefined;

export function db() {
  if (!serverClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key)
      throw new Error("Configura las variables de Supabase en .env.local");
    serverClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serverClient;
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function currentMember(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !anon) return null;
  const authClient = createClient(url, anon, {
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);
  if (error || !user) return null;
  const { data: member, error: memberError } = await db()
    .from("restaurant_members")
    .select("restaurant_id,role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  return { user, member };
}

export function publicError(error: unknown) {
  console.error(error);
  return fail("No pudimos completar la operación. Inténtalo de nuevo.", 500);
}
