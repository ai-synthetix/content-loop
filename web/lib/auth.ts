// client auth helper
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("content_loop_jwt");
}
export function setToken(t: string) {
  localStorage.setItem("content_loop_jwt", t);
}
export function clearToken() {
  localStorage.removeItem("content_loop_jwt");
}
export function authHeaders(): Record<string, string> {
  const t = getToken();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}
export function apiUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  return `${base}${path}`;
}
export function handle401(router: { replace: (url: string) => void }) {
  clearToken();
  router.replace("/login");
}
