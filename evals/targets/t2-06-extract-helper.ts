export function area(width: number, height: number): number {
  return width * height;
}

export function perimeter(width: number, height: number): number {
  return 2 * (width + height);
}

export function describeRectangle(width: number, height: number): string {
  return `area=${width * height}`;
}
