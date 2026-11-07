export function distribution(values: readonly number[]) {
  if (!values.length || values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('비음수 유한 표본이 필요합니다.');
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (p: number) => { const index = (sorted.length - 1) * p, low = Math.floor(index); return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low); };
  const q1 = quantile(.25), q3 = quantile(.75);
  return { n: values.length, median: quantile(.5), q1, q3, iqr: q3 - q1, p95: quantile(.95), min: sorted[0], max: sorted.at(-1)! };
}
