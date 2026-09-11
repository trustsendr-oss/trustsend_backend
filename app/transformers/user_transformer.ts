import type User from '#models/user'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class UserTransformer extends BaseTransformer<User> {
  toObject() {
    // `code` is the account's shareable identifier: without it on the profile, a user has no
    // way to read their own code and give it to someone who wants to pay them — the directory
    // lookup that resolves it (directory_controller.ts) would have nothing to resolve.
    return this.pick(this.resource, [
      'id',
      'fullName',
      'email',
      'code',
      'createdAt',
      'updatedAt',
      'initials',
    ])
  }
}
