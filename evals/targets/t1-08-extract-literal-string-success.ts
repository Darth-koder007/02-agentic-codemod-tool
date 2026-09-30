export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US");
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US");
}
