export interface GuestbookEntry {
  id: number;
  name: string;
  message: string;
  dateIso: string;
}

const API_BASE = "/api/guestbook";

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong guestbook password");
  }
}

export async function loadGuestbook(): Promise<GuestbookEntry[]> {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as GuestbookEntry[]) : [];
  } catch {
    return [];
  }
}

export async function addGuestbookEntry(entry: { name: string; message: string; password: string }): Promise<GuestbookEntry[]> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Failed to add guestbook entry (${res.status})`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as GuestbookEntry[]) : [];
}

export async function editGuestbookEntry(id: number, message: string, password: string): Promise<GuestbookEntry[]> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, password }),
  });
  if (res.status === 403) throw new WrongPasswordError();
  if (!res.ok) throw new Error(`Failed to edit guestbook entry (${res.status})`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as GuestbookEntry[]) : [];
}

export async function deleteGuestbookEntry(id: number, password: string): Promise<GuestbookEntry[]> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.status === 403) throw new WrongPasswordError();
  if (!res.ok) throw new Error(`Failed to delete guestbook entry (${res.status})`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as GuestbookEntry[]) : [];
}
