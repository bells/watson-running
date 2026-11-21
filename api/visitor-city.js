function readCity(header) {
  if (!header) return null;
  try {
    const city = decodeURIComponent(header).trim();
    return city && city.length <= 80 && !/[\x00-\x1f\x7f]/.test(city)
      ? city
      : null;
  } catch {
    return null;
  }
}

export function GET(request) {
  return Response.json(
    { city: readCity(request.headers.get('x-vercel-ip-city')) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
