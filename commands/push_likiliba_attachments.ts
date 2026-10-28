import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Copies the likiliba photos, files and voice messages still on the local disk into the S3
 * bucket, once STORAGE_DRIVER=s3 is set. Run it right after switching, from the container that
 * holds the old storage/ volume.
 *
 * Safe to re-run: each object goes to the same key as before, and the local copies are kept —
 * they are removed by hand once the bucket has been checked.
 *
 *   node ace storage:push-likiliba-attachments --dry-run
 *   node ace storage:push-likiliba-attachments
 */
export default class PushLikilibaAttachments extends BaseCommand {
  static commandName = 'storage:push-likiliba-attachments'
  static description = 'Copy likiliba attachments from the local disk to the S3 bucket'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'List what would be copied without uploading anything' })
  declare dryRun: boolean

  async run() {
    const { readdir, readFile } = await import('node:fs/promises')
    const { default: env } = await import('#start/env')
    const { default: LikilibaMessage } = await import('#models/likiliba_message')
    const { objectStore } = await import('#services/storage/object_store')
    const { LOCAL_ATTACHMENTS_DIR } = await import('#services/likiliba/attachment_storage_service')

    if (env.get('STORAGE_DRIVER') !== 's3') {
      this.logger.error('STORAGE_DRIVER is not "s3": there is no bucket to copy to.')
      this.exitCode = 1
      return
    }

    const files = await readdir(LOCAL_ATTACHMENTS_DIR).catch(() => [] as string[])
    if (files.length === 0) {
      this.logger.info('No attachment on the local disk: nothing to copy.')
      return
    }

    // The type each object is served with is the one recorded on its message.
    const messages = await LikilibaMessage.query()
      .whereIn('attachmentRef', files)
      .select('attachmentRef', 'attachmentMimeType')
    const types = new Map(messages.map((m) => [m.attachmentRef!, m.attachmentMimeType]))
    const bucket = objectStore('likiliba', LOCAL_ATTACHMENTS_DIR)

    let copied = 0
    for (const ref of files) {
      if (!types.has(ref)) {
        // Left behind by a message that failed to save: no row will ever point at it.
        this.logger.warning(`${ref}: no message refers to it, skipped`)
        continue
      }
      if (this.dryRun) {
        this.logger.info(`${ref}: would be copied`)
        continue
      }
      const bytes = await readFile(`${LOCAL_ATTACHMENTS_DIR}${ref}`)
      await bucket.put(ref, bytes, types.get(ref) ?? 'application/octet-stream')
      copied += 1
    }
    this.logger.success(
      this.dryRun
        ? `${files.length} file(s) found.`
        : `${copied} file(s) copied to ${env.get('S3_BUCKET')}/likiliba/.`
    )
  }
}
