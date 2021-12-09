// Confession of ignorance.
// When you do d = new Date('some date string') and stick d1 into the database,
// the result in the database is localized, thus in BC it goes to the date string
// less 6 or 7 hours depending on the time of year.
// But I like that new Date('some date string') can parse just about any date string.
// So welcome to this kludge
export function fudgeDateToUtc(d: Date): Date {
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    )
}
