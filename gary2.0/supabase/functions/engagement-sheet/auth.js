/** Private bookmark token gate. Missing configuration must never authorize an
 * empty query token when gateway JWT checks are disabled for the browser page.
 */
export function hasSheetAccess(configuredToken, suppliedToken) {
  return typeof configuredToken === 'string' && configuredToken.trim().length > 0
    && typeof suppliedToken === 'string' && suppliedToken === configuredToken;
}
