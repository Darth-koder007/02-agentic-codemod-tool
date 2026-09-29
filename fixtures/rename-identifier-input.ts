function calculateTotal(items: number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}

const result = calculateTotal([1, 2, 3]);
console.log(calculateTotal, result);
