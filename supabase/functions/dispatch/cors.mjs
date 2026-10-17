// Sites allowed to call this function from a browser. The app moves from GitHub Pages
// to homebasedrivers.com (Cloudflare); both work during the switch.
export const ALLOWED_ORIGINS = ['https://homebasedrivers.com', 'https://www.homebasedrivers.com', 'https://home-base-drivers.github.io'];
export const isAllowedOrigin = origin => ALLOWED_ORIGINS.includes(origin);
// Echo the caller's origin when it is allowed (a response can name only one origin).
export function withAllowedOrigin(handler) {
  return async request => {
    const origin = request.headers.get('Origin');
    const response = await handler(request);
    if (!origin || !isAllowedOrigin(origin)) return response;
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
