// Same-origin by default so a missing VITE_API_URL doesn't produce
// requests to literally "undefined/api/..." in production builds.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''
