// URLs for the `sv://` image protocol served by the Rust backend.
// On Windows, WebView2 exposes custom schemes as http://<scheme>.localhost.

const isWindows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");
const BASE = isWindows ? "http://sv.localhost" : "sv://localhost";

export const thumbUrl = (id: number, version: number) => `${BASE}/thumb/${id}?v=${version}`;
export const imageUrl = (id: number, version: number) => `${BASE}/image/${id}?v=${version}`;
export const originalUrl = (id: number, version: number) => `${BASE}/original/${id}?v=${version}`;
export const overlayUrl = (session: number) => `${BASE}/overlay/${session}`;
