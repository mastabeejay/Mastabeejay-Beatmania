import { supabase } from "./supabaseClient";

/** Records one page visit against Supabase's persistent counter (increment_visits() in
 *  supabase/schema.sql) and returns the new cumulative total. Returns null if unreachable — the
 *  counter is cosmetic, so a failed request shouldn't block anything else on the page. */
export async function reportVisit(): Promise<number | null> {
  const { data, error } = await supabase.rpc("increment_visits");
  if (error || typeof data !== "number") return null;
  return data;
}
