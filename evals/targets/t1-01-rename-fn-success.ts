export function fetchUser(id: string): string {
  return `user-${id}`;
}

console.log(fetchUser("42"));
