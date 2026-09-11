import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'
import type { InferMailers } from '@adonisjs/mail/types'

/**
 * Namecheap Private Email (mail.privateemail.com) via plain SMTP — no dedicated ESP account,
 * just the mailbox credentials configured on Namecheap's side. Port 465 = implicit TLS
 * (secure: true), any other port (587 = STARTTLS, Namecheap's recommended default) negotiates
 * TLS after connecting (secure: false). All values come from env so nothing here is
 * Namecheap/TumaPlus-specific by accident — swapping providers later only means changing
 * .env, not this file.
 */
const mailConfig = defineConfig({
  default: 'smtp',

  from: {
    address: env.get('MAIL_FROM_ADDRESS'),
    name: env.get('MAIL_FROM_NAME'),
  },

  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST'),
      port: env.get('SMTP_PORT'),
      secure: env.get('SMTP_PORT') === 465,
      auth: {
        type: 'login',
        user: env.get('SMTP_USERNAME'),
        pass: env.get('SMTP_PASSWORD').release(),
      },
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
