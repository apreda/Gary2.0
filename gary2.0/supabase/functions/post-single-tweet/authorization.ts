/** X operations and their queues are internal service operations.
 * Public/user JWTs cannot authorize posting, deletion, models or account metrics.
 */
export function isSocialServiceRequest(request: Request, serviceKey: string | undefined): boolean {
  return typeof serviceKey === "string" && serviceKey.length > 0 &&
    request.headers.get("authorization") === `Bearer ${serviceKey}`;
}
