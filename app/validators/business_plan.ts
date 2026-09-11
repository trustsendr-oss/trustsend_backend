import vine from '@vinejs/vine'

export const subscribeToPlanValidator = vine.create({
  plan_id: vine.number().positive(),
  // Only required for a dashboard session (see business/plan_controller.ts) — an API key call
  // has no PIN, the key itself is the credential.
  pin: vine.string().optional(),
})
