export function filterByTimeRange<T extends { timestamp: string }>(
  data: T[],
  fromTimestamp: number,
  toTimestamp: number
): T[] {
  return data.filter(d => {
    const t = new Date(d.timestamp).getTime();
    return t >= fromTimestamp && t <= toTimestamp;
  });
}