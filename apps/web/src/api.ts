import ky from "ky"

const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8787" : window.location.origin)

export const api = ky.create({ prefixUrl: apiBase, timeout: 20000, retry: 0 })
