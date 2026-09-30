const API_BASE = "https://example.com/api";

export function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}
