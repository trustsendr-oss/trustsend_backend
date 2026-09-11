import { test } from '@japa/runner'
import { P2pTransferService } from '#services/transactions/p2p_transfer_service'
import { Money } from '#services/money/money'
import { createUserWithWallet, TEST_PIN } from '#tests/helpers/user_helper'

test.group('P2P Transfers', (group) => {
  group.setup(async () => {
    // Setup test database
  })

  group.teardown(async () => {
    // Cleanup
  })

  test('POST /api/v1/transfers - should create transfer between two wallets', async ({ client, assert }) => {
    const sender = await createUserWithWallet({ email: 'sender@test.com', balance: 100000n })
    const recipient = await createUserWithWallet({ email: 'recipient@test.com', balance: 0n })

    const response = await client
      .post('/api/v1/transfers/p2p')
      .loginAs(sender.user)
      .json({
        recipient_wallet_id: recipient.wallet.id,
        amount: '50000',
        currency_code: 'USD',
        idempotency_key: '11111111-1111-4111-8111-111111111012',
        pin: TEST_PIN,
      })

    assert.equal(response.status(), 201)
    assert.exists(response.body().data.transaction_uuid)
    assert.equal(response.body().data.status, 'completed')
    assert.equal(response.body().data.amount.amount, '50000')
  })

  test('POST /api/v1/transfers - should reject transfer with insufficient balance', async ({ client, assert }) => {
    const sender = await createUserWithWallet({ email: 'poor@test.com', balance: 1000n })
    const recipient = await createUserWithWallet({ email: 'rich@test.com', balance: 0n })

    const response = await client
      .post('/api/v1/transfers/p2p')
      .loginAs(sender.user)
      .json({
        recipient_wallet_id: recipient.wallet.id,
        amount: '50000',
        currency_code: 'USD',
        idempotency_key: '11111111-1111-4111-8111-111111111013',
        pin: TEST_PIN,
      })

    assert.equal(response.status(), 402) // Payment Required
    assert.match(response.body().message, /insufficient balance/i)
  })

  test('POST /api/v1/transfers - should reject transfer above transaction limit', async ({ client, assert }) => {
    const sender = await createUserWithWallet({
      email: 'limited@test.com',
      balance: 1000000n,
      perTransactionLimit: 100000n,
    })
    const recipient = await createUserWithWallet({ email: 'recipient2@test.com', balance: 0n })

    const response = await client
      .post('/api/v1/transfers/p2p')
      .loginAs(sender.user)
      .json({
        recipient_wallet_id: recipient.wallet.id,
        amount: '500000',
        currency_code: 'USD',
        idempotency_key: '11111111-1111-4111-8111-111111111014',
        pin: TEST_PIN,
      })

    assert.equal(response.status(), 400)
    assert.match(response.body().message, /limit exceeded/i)
  })

  test('POST /api/v1/transfers - should validate currency code', async ({ client, assert }) => {
    const sender = await createUserWithWallet({ email: 'user1@test.com', balance: 100000n })
    const recipient = await createUserWithWallet({ email: 'user2@test.com', balance: 0n })

    const response = await client
      .post('/api/v1/transfers/p2p')
      .loginAs(sender.user)
      .json({
        recipient_wallet_id: recipient.wallet.id,
        amount: '50000',
        currency_code: 'INVALID',
        idempotency_key: '11111111-1111-4111-8111-111111111015',
        pin: TEST_PIN,
      })

    assert.equal(response.status(), 422) // Unprocessable Entity
  })

  test('POST /api/v1/transfers - should require valid idempotency key', async ({ client, assert }) => {
    const sender = await createUserWithWallet({ email: 'user3@test.com', balance: 100000n })
    const recipient = await createUserWithWallet({ email: 'user4@test.com', balance: 0n })

    const response = await client
      .post('/api/v1/transfers/p2p')
      .loginAs(sender.user)
      .json({
        recipient_wallet_id: recipient.wallet.id,
        amount: '50000',
        currency_code: 'USD',
        idempotency_key: 'not-a-uuid',
        pin: TEST_PIN,
      })

    assert.equal(response.status(), 422)
  })

  test('GET /api/v1/transfers/:uuid - should retrieve transfer details', async ({ client, assert }) => {
    const sender = await createUserWithWallet({ email: 'sender5@test.com', balance: 100000n })
    const recipient = await createUserWithWallet({ email: 'recipient5@test.com', balance: 0n })

    // Create transfer
    const createResponse = await client
      .post('/api/v1/transfers/p2p')
      .loginAs(sender.user)
      .json({
        recipient_wallet_id: recipient.wallet.id,
        amount: '30000',
        currency_code: 'USD',
        idempotency_key: '11111111-1111-4111-8111-111111111016',
        pin: TEST_PIN,
      })

    const transferUuid = createResponse.body().data.transaction_uuid

    // Retrieve transfer
    const getResponse = await client
      .get(`/api/v1/transfers/p2p/${transferUuid}`)
      .loginAs(sender.user)

    assert.equal(getResponse.status(), 200)
    assert.equal(getResponse.body().data.uuid, transferUuid)
  })

  test('GET /api/v1/transfers/:uuid - should reject access if user is not sender/recipient', async ({
    client,
    assert,
  }) => {
    const sender = await createUserWithWallet({ email: 'sender6@test.com', balance: 100000n })
    const recipient = await createUserWithWallet({ email: 'recipient6@test.com', balance: 0n })
    const stranger = await createUserWithWallet({ email: 'stranger@test.com', balance: 0n })

    // Create transfer
    const createResponse = await client
      .post('/api/v1/transfers/p2p')
      .loginAs(sender.user)
      .json({
        recipient_wallet_id: recipient.wallet.id,
        amount: '30000',
        currency_code: 'USD',
        idempotency_key: '11111111-1111-4111-8111-111111111017',
        pin: TEST_PIN,
      })

    const transferUuid = createResponse.body().data.transaction_uuid

    // Try to access as stranger
    const getResponse = await client
      .get(`/api/v1/transfers/p2p/${transferUuid}`)
      .loginAs(stranger.user)

    assert.equal(getResponse.status(), 403)
  })

  test('GET /api/v1/transfers - should list user transfers with pagination', async ({ client, assert }) => {
    const sender = await createUserWithWallet({ email: 'sender7@test.com', balance: 1000000n })
    const recipient = await createUserWithWallet({ email: 'recipient7@test.com', balance: 0n })

    // Create multiple transfers
    for (let i = 0; i < 5; i++) {
      await client
        .post('/api/v1/transfers/p2p')
        .loginAs(sender.user)
        .json({
          recipient_wallet_id: recipient.wallet.id,
          amount: '10000',
          currency_code: 'USD',
          idempotency_key: `11111111-1111-4111-8111-11111111120${i}`,
        pin: TEST_PIN,
        })
    }

    // List transfers with pagination
    const response = await client
      .get('/api/v1/transfers/p2p?page=1&limit=10')
      .loginAs(sender.user)

    assert.equal(response.status(), 200)
    assert.equal(response.body().data.length, 5)
    assert.equal(response.body().meta.total, 5)
    assert.equal(response.body().meta.page, 1)
  })

  test('POST /api/v1/transfers - should handle idempotency (duplicate request)', async ({ client, assert }) => {
    const sender = await createUserWithWallet({ email: 'idempotent@test.com', balance: 100000n })
    const recipient = await createUserWithWallet({ email: 'idempotent-recv@test.com', balance: 0n })

    const payload = {
      recipient_wallet_id: recipient.wallet.id,
      amount: '25000',
      currency_code: 'USD',
      idempotency_key: '11111111-1111-4111-8111-111111111099',
        pin: TEST_PIN,
    }

    // First request
    const response1 = await client
      .post('/api/v1/transfers/p2p')
      .loginAs(sender.user)
      .json(payload)

    // Duplicate request
    const response2 = await client
      .post('/api/v1/transfers/p2p')
      .loginAs(sender.user)
      .json(payload)

    assert.equal(response1.status(), 201)
    assert.equal(response2.status(), 201)
    assert.equal(response1.body().data.transaction_uuid, response2.body().data.transaction_uuid)
  })

  test('double-entry ledger should balance after transfer', async ({ assert }) => {
    const sender = await createUserWithWallet({ email: 'ledger@test.com', balance: 100000n })
    const recipient = await createUserWithWallet({ email: 'ledger-recv@test.com', balance: 0n })

    const amount = new Money(50000n, 'XOF')

    await P2pTransferService.initiate({
      senderWalletId: sender.wallet.id,
      recipientWalletId: recipient.wallet.id,
      amount,
      correlationId: 'test-correlation',
      initiatedByType: 'user',
      initiatedById: sender.user.id,
      idempotencyKey: '12345678-1234-1234-1234-123456789100',
    })

    // Verify sender balance
    const senderWallet = await sender.wallet.refresh()
    assert.equal(senderWallet.balanceCache, 50000n)

    // Verify recipient balance
    const recipientWallet = await recipient.wallet.refresh()
    assert.equal(recipientWallet.balanceCache, 50000n)
  })
})
