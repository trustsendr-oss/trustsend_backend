import vine from '@vinejs/vine'

/**
 * Shared rules for email and password.
 */
const email = () => vine.string().email().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(32)

/**
 * Step 1 of self-signup: only the address the verification code is sent to.
 */
export const requestSignupOtpValidator = vine.create({
  email: email(),
})

/**
 * Validator to use when performing self-signup. `otp` is the code sent by step 1 — see
 * UserSignupOtpService. The uniqueness check stays here too (defense in depth): step 1 already
 * refused a taken address, but re-validating right before the INSERT closes the race where two
 * step-1 requests for the same address both get a code.
 */
export const signupValidator = vine.create({
  fullName: vine.string().nullable(),
  email: email().unique({ table: 'users', column: 'email' }),
  otp: vine.string().regex(/^\d{6}$/),
  password: password(),
  passwordConfirmation: password().sameAs('password'),
})

/**
 * Validator to use before validating user credentials
 * during login
 */
export const loginValidator = vine.create({
  email: email(),
  password: vine.string(),
})
