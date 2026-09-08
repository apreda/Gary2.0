/** Grading and paid selection audits are internal service operations. */
export function isServiceAudit(request: Request, serviceKey: string | undefined): boolean {
  return typeof serviceKey === "string" && serviceKey.length > 0 &&
    request.headers.get("authorization") === `Bearer ${serviceKey}`;
}
