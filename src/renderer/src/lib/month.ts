export interface DayRange {
  start: Date
  /** exclusive */
  end: Date
}

/** The 42 days of a month sheet, Monday first, around the month of `date`. */
export function monthGrid(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7))
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  )
}

/** The days to shade in the sidebar's month: a week or a day, never a whole month. */
export function shadeFor(current: DayRange | undefined): DayRange | undefined {
  return current && current.end.getTime() - current.start.getTime() <= 8 * 86_400_000
    ? current
    : undefined
}

/** Where `date` sits in `range`: outside, or with rounded ends at its first and last day. */
export function rangePart(
  date: Date,
  range: DayRange | undefined,
): { inside: boolean; first: boolean; last: boolean } {
  const inside = (d: Date) => range !== undefined && d >= range.start && d < range.end
  const shift = (days: number) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
  const here = inside(date)
  return { inside: here, first: here && !inside(shift(-1)), last: here && !inside(shift(1)) }
}
