export function GET(request: Request) {
  const source = new URL(request.url);
  const destination = new URL('/account', source);
  destination.search = source.search;
  return Response.redirect(destination, 308);
}

export const HEAD = GET;
