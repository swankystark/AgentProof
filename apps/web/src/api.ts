import ky, { HTTPError } from "ky"

const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8787" : window.location.origin)

export const api = ky.create({
  prefixUrl: apiBase,
  timeout: 60000,
  retry: 0,
  credentials: "include",
  hooks: {
    beforeRequest: [request => {
      const sessionId = new URLSearchParams(window.location.search).get("sessionId")
      if (sessionId) request.headers.set("X-Testing-Session-Id", sessionId)
    }],
  },
})

export async function extractErrorMessage(cause: unknown, fallback: string): Promise<string> {
  if (cause instanceof HTTPError && cause.response) {
    try {
      const data = (await cause.response.clone().json()) as { readonly error?: string; readonly message?: string }
      if (data?.error) return data.error
      if (data?.message) return data.message
    } catch {
      try {
        const text = await cause.response.clone().text()
        if (text) return text
      } catch {
        // use fallback
      }
    }
  }
  if (cause instanceof Error) return cause.message
  return fallback
}
