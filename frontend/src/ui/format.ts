/** Number formatting used everywhere, Russian locale. */
export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString('ru-RU'),
  km: (m: number) => (m >= 1000 ? (m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : String(Math.round(m))),
  kmUnit: (m: number) => (m >= 1000 ? 'км' : 'м'),
  deg: (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 }),
  height: (m: number) => `${m > 0 ? '+' : m < 0 ? '−' : ''}${Math.abs(Math.round(m)).toLocaleString('ru-RU')}`,
}
