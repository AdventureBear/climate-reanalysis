// Same-origin by default so a missing VITE_API_URL doesn't produce
// requests to literally "undefined/api/..." in production builds.
export const API_BASE = import.meta.env.VITE_API_URL ?? ''
