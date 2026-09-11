import UserTransformer from '#transformers/user_transformer'
import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'

export default class ProfileController {
  async show({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail() as User
    return serialize(UserTransformer.transform(user))
  }
}
