import ky from "ky"
import { z } from "zod"
import { aiConfigured, config } from "./config"

const responseSchema = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) })).min(1) })

export async function answerAnalyticsQuestion(question: unknown, evidence: unknown): Promise<string> {
  const parsed = z.object({ question: z.string().trim().min(2).max(1200) }).safeParse({ question })
  if (!parsed.success) throw new TypeError("Analytics question must be between 2 and 1200 characters")
  if (!aiConfigured || !config.GEMINI_API_KEY) throw new Error("Gemini is not configured; AG Studio analysis is unavailable")
  const response = await ky.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`, {
    json: {
      contents: [{
        role: "user",
        parts: [{
          text: `You are the AgentProof AG Studio analytics assistant. Answer the user's question clearly and concisely using only the evidence snapshot below.

Rules:
1. Explain findings using plain, natural business language suitable for an application user or store manager.
2. DO NOT use raw code identifiers, variable names, database column names, camelCase terms, or technical invariant codes (such as I1, I2, scheduleRunId, order_id, etc.). Instead use clear English concepts like "Order total", "Payment verification", "Duplicate delivery", "Customer spending limit", or "Network failure".
3. Distinguish simulated failure test runs from real PayPal Sandbox transactions.
4. Do not invent events or metrics.
5. Give a complete, well-formed response with every sentence properly finished. Never leave thoughts or lists truncated.
6. Keep explanations concise, direct, and actionable. Avoid academic or paper-style theory.

Evidence snapshot:
${JSON.stringify(evidence).slice(0, 14000)}

Question:
${parsed.data.question}`
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2500,
      }
    },
    timeout: 25_000,
    retry: 0,
  }).json<unknown>()
  const result = responseSchema.parse(response)
  const answer = result.candidates[0]?.content.parts.flatMap((part) => part.text ? [part.text] : []).join(" ").trim()
  if (!answer) throw new Error("Gemini returned an empty analytics response")
  return answer
}
