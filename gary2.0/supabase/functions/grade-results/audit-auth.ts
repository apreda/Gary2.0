/** Internal audits can reveal the current paid Winners selection. */
export function isServiceAudit(request: Request, serviceKey: string): boolean {
  return serviceKey.length > 0 && request.headers.get("authorization") === `Bearer ${serviceKey}`;
}
