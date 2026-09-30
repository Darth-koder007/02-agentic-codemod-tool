export function fetchWithRetry(url: string): void {
  attempt(url, 3);
}

export function fetchBackgroundJob(url: string): void {
  attempt(url, 3);
}

function attempt(url: string, retries: number): void {
  console.log(url, retries);
}
