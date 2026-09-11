import vine from '@vinejs/vine'

/**
 * Step 1 of business signup: request a verification code for this email. See
 * business_dashboard/auth_controller.ts requestSignupOtp() — the email-already-registered check
 * happens in the controller (not here via .unique()) so it can respond with a clear,
 * actionable message before ever generating a code.
 */
export const requestBusinessSignupOtpValidator = vine.create({
  email: vine.string().email(),
})

/**
 * Step 2: the actual account creation, gated on the code issued by step 1 — see
 * BusinessSignupOtpService.verifyAndConsume(). The email uniqueness check stays here too
 * (defense in depth): the controller already checked it in step 1, but re-validating right
 * before the INSERT closes the race where two step-1 requests for the same email both get a
 * valid code and only one step-2 call should be allowed to actually create the account.
 */
export const businessSignupValidator = vine.create({
  name: vine.string().minLength(2).maxLength(255),
  email: vine.string().email().unique(async (db, value) => {
    const business = await db.from('businesses').where('email', value).first()
    return !business
  }),
  otp: vine.string().regex(/^\d{6}$/),
  phone: vine.string().minLength(8).maxLength(20),
  password: vine.string().minLength(8),
  code: vine
    .string()
    .minLength(2)
    .maxLength(20)
    .unique(async (db, value) => {
      const business = await db.from('businesses').where('code', value).first()
      return !business
    })
    .optional(),
})

export const businessLoginValidator = vine.create({
  email: vine.string().email(),
  password: vine.string(),
})

export const businessChangePasswordValidator = vine.create({
  current_password: vine.string(),
  new_password: vine.string().minLength(8),
})

export const updateBusinessProfileValidator = vine.create({
  name: vine.string().minLength(2).maxLength(255).optional(),
  phone: vine.string().minLength(8).maxLength(20).optional(),
  webhook_url: vine.string().url().optional(),
})
