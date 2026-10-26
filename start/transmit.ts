import transmit from '@adonisjs/transmit/services/main'
import User from '#models/user'
import { userChannel } from '#services/realtime/realtime'

/*
|--------------------------------------------------------------------------
| Realtime (Server-Sent Events)
|--------------------------------------------------------------------------
|
| The routes live under /api/v1/__transmit (start/routes.ts), behind the API's token auth, and the
| client's connection id is namespaced with the signed-in user's id there, so nobody can attach
| to — or read — another user's stream by guessing its id.
|
| Each stream is subscribed to its owner's channel as soon as it opens: the app only has to open
| the connection. Other channels (a likiliba group…) go through /subscribe and `authorize`.
|
*/

transmit.authorize<{ id: string }>('users/:id', (ctx, { id }) => {
  const user = ctx.auth.user
  return user instanceof User && user.id === Number(id)
})

transmit.on('connect', ({ uid, context }) => {
  const user = context.auth.user
  if (!(user instanceof User)) return
  void transmit.subscribe({ uid, channel: userChannel(user.id), context })
})
