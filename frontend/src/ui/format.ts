/** Number formatting used everywhere, Russian locale. */
export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString('ru-RU'),
  km: (m: number) =>
    Math.round(m) >= 1000 ? (m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : String(Math.round(m)),
  kmUnit: (m: number) => (Math.round(m) >= 1000 ? 'км' : 'м'),
  deg: (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 }),
  height: (m: number) => {
    const r = Math.round(m)
    return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('ru-RU')}`
  },
}
