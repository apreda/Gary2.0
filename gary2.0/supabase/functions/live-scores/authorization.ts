/** Cache refreshes are internal; public clients read the cached REST tables. */
export function isCacheServiceRequest(request: Request, serviceKey: string | undefined): boolean {
  return typeof serviceKey === "string" && serviceKey.length > 0 &&
    request.headers.get("authorization") === `Bearer ${serviceKey}`;
}
