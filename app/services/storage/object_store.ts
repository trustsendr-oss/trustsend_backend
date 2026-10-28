import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import env from '#start/env'

/** Where uploaded bytes live: the local disk, or an S3-compatible bucket (MinIO). */
export interface ObjectStore {
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>
  get(key: string): Promise<Buffer>
  /** A missing object is not an error: the goal is that it is gone. */
  delete(key: string): Promise<void>
}

/** One file per key in a directory; for development, tests and single-server setups. */
class LocalStore implements ObjectStore {
  constructor(private readonly dir: string) {}

  async put(key: string, bytes: Buffer) {
    await mkdir(this.dir, { recursive: true })
    await writeFile(`${this.dir}${key}`, bytes)
  }

  async get(key: string) {
    return readFile(`${this.dir}${key}`)
  }

  async delete(key: string) {
    try {
      await unlink(`${this.dir}${key}`)
    } catch {
      // Already gone: nothing to do.
    }
  }
}

/**
 * A private bucket. Objects are never public: the API reads them back and serves them to whoever
 * may see them, exactly as from the disk.
 */
class S3Store implements ObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly prefix: string
  ) {}

  async put(key: string, bytes: Buffer, mimeType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `${this.prefix}${key}`,
        Body: bytes,
        ContentType: mimeType,
      })
    )
  }

  async get(key: string) {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: `${this.prefix}${key}` })
    )
    return Buffer.from(await object.Body!.transformToByteArray())
  }

  async delete(key: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: `${this.prefix}${key}` })
      )
    } catch (error) {
      if (!(error instanceof NoSuchKey)) throw error
    }
  }
}

let client: S3Client | null = null

/** One client for the process; MinIO wants path-style addressing (`host/bucket/key`). */
function s3Client() {
  client ??= new S3Client({
    endpoint: env.get('S3_ENDPOINT'),
    region: env.get('S3_REGION') ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.get('S3_ACCESS_KEY')!,
      secretAccessKey: env.get('S3_SECRET_KEY')!.release(),
    },
  })
  return client
}

/**
 * The store for one kind of upload. `STORAGE_DRIVER=s3` puts it under `prefix` in `S3_BUCKET`;
 * otherwise (the default) it stays in `localDir`, as before.
 */
export function objectStore(prefix: string, localDir: string): ObjectStore {
  if (env.get('STORAGE_DRIVER') === 's3') {
    return new S3Store(s3Client(), env.get('S3_BUCKET')!, `${prefix}/`)
  }
  return new LocalStore(localDir)
}
