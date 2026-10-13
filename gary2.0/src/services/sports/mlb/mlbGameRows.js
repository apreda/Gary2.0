/** A start is an explicit provider role, including a starter who records zero outs. */
export function isMlbStart(row) {
  const value = row?.games_started;
  return (typeof value === 'number' || typeof value === 'string')
    && String(value).trim() !== '' && Number(value) === 1;
}
