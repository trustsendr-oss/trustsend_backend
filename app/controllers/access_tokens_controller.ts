import { DateTime } from 'luxon'
import User from '#models/user'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'

const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MINUTES = 15

export default class AccessTokensController {
  async store({ request, response, serialize }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    // Look the account up first so a lock can be enforced even before verifying the password
    // (verifyCredentials would otherwise happily keep re-checking the password forever).
    const existingUser = await User.findBy('email', email)
    if (existingUser?.loginLockedUntil && existingUser.loginLockedUntil > DateTime.now()) {
      const minutesLeft = Math.ceil(existingUser.loginLockedUntil.diffNow('minutes').minutes)
      return response.tooManyRequests({
        message: `Account locked for ${minutesLeft} more minutes due to too many failed login attempts`,
      })
    }

    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch (error) {
      if (existingUser) {
        existingUser.loginAttempts = (existingUser.loginAttempts || 0) + 1
        if (existingUser.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
          existingUser.loginLockedUntil = DateTime.now().plus({ minutes: LOGIN_LOCKOUT_MINUTES })
        }
        await existingUser.save()
      }
      throw error
    }

    user.loginAttempts = 0
    user.loginLockedUntil = null
    await user.save()

    const token = await User.accessTokens.create(user, ['*'], {
      expiresIn: '1h', // Access token expires in 1 hour
    })

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
      expiresIn: 3600,
    })
  }

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token using current token
   */
  async refresh({ auth, serialize }: HttpContext) {
    const authenticatedUser = await auth.authenticate()

    // Type assertion since we know it's a user in this context
    if (authenticatedUser instanceof User) {
      if (!authenticatedUser.currentAccessToken) {
        return {
          message: 'No current token found',
        }
      }

      // Create new token with longer expiration
      const newToken = await User.accessTokens.create(authenticatedUser, ['*'], {
        expiresIn: '1h',
      })

      // Delete old token
      await User.accessTokens.delete(
        authenticatedUser,
        authenticatedUser.currentAccessToken.identifier
      )

      return serialize({
        user: UserTransformer.transform(authenticatedUser),
        token: newToken.value!.release(),
        expiresIn: 3600,
      })
    }

    return { message: 'Unauthorized' }
  }

  async destroy({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    }

    return {
      message: 'Logged out successfully',
    }
  }
}
