/** Records one page visit against the server's persistent counter (server/db.js) and returns the
 *  new cumulative total. Returns null if the API is unreachable — the counter is cosmetic, so a
 *  failed request shouldn't block anything else on the page. */
export async function reportVisit(): Promise<number | null> {
  try {
    const res = await fetch("/api/visits", { method: "POST" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const count = (data as { count?: unknown })?.count;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}
