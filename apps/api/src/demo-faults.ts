import { config } from "./config"

const demoAvailable = config.DEMO_MODE === "true" && config.PAYPAL_ENV === "sandbox"
let duplicateFulfillmentEnabled = demoAvailable && process.env.DEMO_DUPLICATE_FULFILLMENT === "true"

export function getDemoFaultSettings(): { readonly available: boolean; readonly duplicateFulfillment: boolean } {
  return { available: demoAvailable, duplicateFulfillment: duplicateFulfillmentEnabled }
}

export function setDuplicateFulfillment(enabled: boolean): { readonly available: boolean; readonly duplicateFulfillment: boolean } {
  if (!demoAvailable && enabled) throw new Error("Demo fault injection is only available in the Sandbox demo environment")
  duplicateFulfillmentEnabled = demoAvailable && enabled
  return getDemoFaultSettings()
}

export function isDuplicateFulfillmentEnabled(): boolean {
  return duplicateFulfillmentEnabled
}
