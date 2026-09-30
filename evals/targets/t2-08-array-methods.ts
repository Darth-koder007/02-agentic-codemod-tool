export function doubleAll(items: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < items.length; i++) {
    result.push(items[i]! * 2);
  }
  return result;
}
