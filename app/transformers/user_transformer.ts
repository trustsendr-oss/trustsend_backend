import type User from '#models/user'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class UserTransformer extends BaseTransformer<User> {
  toObject() {
    // `code` is the account's shareable identifier: without it on the profile, a user has no
    // way to read their own code and give it to someone who wants to pay them — the directory
    // lookup that resolves it (directory_controller.ts) would have nothing to resolve.
    return {
      ...this.pick(this.resource, [
        'id',
        'fullName',
        'email',
        'code',
        'createdAt',
        'updatedAt',
        'initials',
      ]),
      // Owner-only route (profile_controller.ts). The `v` query changes with every new photo, so
      // a client cache never shows the previous one; null means "show the initials".
      avatarUrl: this.resource.avatarRef
        ? `/api/v1/account/avatar?v=${this.resource.avatarRef.slice(0, 8)}`
        : null,
    }
  }
}
