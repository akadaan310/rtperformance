import type { SupabaseClient } from "@supabase/supabase-js";
import type { Principal } from "@/lib/auth/permissions";
import type { Organization } from "@/lib/types";

/**
 * What every service operation receives. Built from the authenticated session on the server; never from
 * client- or model-supplied values. `supabase` is the user's RLS-bound client.
 */
export interface ServiceContext extends Principal {
  supabase: SupabaseClient;
  user: { id: string; email: string; fullName: string | null };
  org: Pick<Organization, "id" | "slug" | "name" | "kind" | "status">;
  athleteId: string | null;
  /** 'ai' when the operation was initiated by The Tech Guy (recorded in audit events). */
  source?: "app" | "ai";
}
