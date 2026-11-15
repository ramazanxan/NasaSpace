/** Number formatting used everywhere, US English locale. */
export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString('en-US'),
  km: (m: number) =>
    Math.round(m) >= 1000 ? (m / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) : String(Math.round(m)),
  kmUnit: (m: number) => (Math.round(m) >= 1000 ? 'km' : 'm'),
  deg: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 }),
  height: (m: number) => {
    const r = Math.round(m)
    return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('en-US')}`
  },
}
