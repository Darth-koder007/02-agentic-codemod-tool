export function fetchWithRetry(url: string) {
  return retry(url, 3);
}

export function anotherCaller(url: string) {
  return retry(url, 3);
}
