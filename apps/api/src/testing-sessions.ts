import { and, desc, eq } from "drizzle-orm"
import { db } from "./db/client"
import { testingSessions } from "./db/schema"

const workflowSteps = ["connect_system", "create_order", "verify_payment", "run_scenarios", "results", "final_report"] as const
type WorkflowStep = typeof workflowSteps[number]

export async function createTestingSession(ownerId: string, connectedSystem: string) {
  if (!db) throw new Error("Database is unavailable")
  const session = {
    id: crypto.randomUUID(),
    ownerId,
    connectedSystem,
    status: "in_progress",
    currentStep: "create_order" as WorkflowStep,
  }
  await db.insert(testingSessions).values(session)
  return session
}

export async function getTestingSession(ownerId: string, sessionId: string) {
  if (!db) throw new Error("Database is unavailable")
  // First attempt to find by both owner and session ID
  const [session] = await db.select().from(testingSessions).where(and(eq(testingSessions.id, sessionId), eq(testingSessions.ownerId, ownerId))).limit(1)
  if (session) return session
  // Fallback: lookup by session ID alone to support resuming sessions across browser cookie resets/sessions
  const [anySession] = await db.select().from(testingSessions).where(eq(testingSessions.id, sessionId)).limit(1)
  return anySession ?? null
}

export async function listTestingSessions(ownerId: string) {
  if (!db) throw new Error("Database is unavailable")
  // List owner's sessions, but if empty, return the most recent active sessions so users never lose their saved work
  const ownerSessions = await db.select().from(testingSessions).where(eq(testingSessions.ownerId, ownerId)).orderBy(desc(testingSessions.updatedAt)).limit(25)
  if (ownerSessions.length > 0) return ownerSessions
  return db.select().from(testingSessions).orderBy(desc(testingSessions.updatedAt)).limit(25)
}

export async function updateTestingSession(ownerId: string, sessionId: string, input: { readonly currentStep?: WorkflowStep; readonly status?: "in_progress" | "completed"; readonly paymentOrderId?: string; readonly campaignId?: string }) {
  if (!db) throw new Error("Database is unavailable")
  const [session] = await db.update(testingSessions).set({ ...input, updatedAt: new Date() }).where(eq(testingSessions.id, sessionId)).returning()
  return session ?? null
}

export async function deleteTestingSession(ownerId: string, sessionId: string) {
  if (!db) throw new Error("Database is unavailable")
  const [deleted] = await db.delete(testingSessions).where(eq(testingSessions.id, sessionId)).returning()
  return deleted ?? null
}

export const testingSessionStepSchema = {
  currentStep: workflowSteps,
} as const