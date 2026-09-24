import { test } from '@japa/runner'
import Business from '#models/business'
import BusinessStaff from '#models/business_staff'
import TellerSession from '#models/teller_session'
import Agent from '#models/agent'
import {
  VaultManagementService,
  VaultException,
} from '#services/treasury/vault_management_service'

async function findImf(): Promise<Business> {
  return Business.query().where('kind', 'imf').where('status', 'active').firstOrFail()
}

async function findTellerAndManager(businessId: number): Promise<{
  teller: BusinessStaff
  manager: BusinessStaff
}> {
  const teller = await BusinessStaff.query()
    .where('business_id', businessId)
    .where('role', 'teller')
    .first()

  const manager = await BusinessStaff.query()
    .where('business_id', businessId)
    .whereIn('role', ['branch_manager', 'admin'])
    .first()

  if (!teller || !manager) throw new Error('Teller or manager not found')
  return { teller, manager }
}

async function findOrCreateSession(businessId: number, staffId: number): Promise<TellerSession> {
  let session = await TellerSession.query()
    .where('business_id', businessId)
    .where('staff_id', staffId)
    .where('status', 'open')
    .first()

  if (!session) {
    const counter = await Agent.query().where('business_id', businessId).first()
    session = new TellerSession()
    session.businessId = businessId
    session.staffId = staffId
    session.agentId = counter ? counter.id : 1
    session.status = 'open'
    await session.save()
  }

  return session
}

test.group('IMF — Vault & Till Cash Management (Étape A)', () => {
  test('replenish workflow: teller requests, vault manager approves (dual control)', async ({
    assert,
  }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const { teller, manager } = await findTellerAndManager(imf.id).catch(() => ({
      teller: null,
      manager: null,
    }))
    if (!teller || !manager) return

    const vault = await VaultManagementService.getOrCreateVault(imf.id, 'USD', 50_000n)
    const session = await findOrCreateSession(imf.id, teller.id)

    // 1. Teller requests replenishment of 5,000 USD
    const transfer = await VaultManagementService.requestReplenishment(
      vault.id,
      session,
      5_000n,
      teller,
      'Morning float replenishment'
    )

    assert.equal(transfer.status, 'requested')
    assert.equal(transfer.amount, 5_000n)
    assert.equal(transfer.transferType, 'replenishment')

    // 2. Self-approval should fail (dual control)
    await assert.rejects(
      () => VaultManagementService.approveTransfer(transfer, teller, 'test-corr-vault-1'),
      VaultException
    )

    // 3. Manager approves transfer
    const initialVaultBalance = vault.balanceCache
    await VaultManagementService.approveTransfer(transfer, manager, 'test-corr-vault-2')

    assert.equal(transfer.status, 'approved')
    await vault.refresh()
    assert.equal(vault.balanceCache, initialVaultBalance - 5_000n)
  })

  test('sweep workflow: teller returns cash to vault', async ({ assert }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const { teller, manager } = await findTellerAndManager(imf.id).catch(() => ({
      teller: null,
      manager: null,
    }))
    if (!teller || !manager) return

    const vault = await VaultManagementService.getOrCreateVault(imf.id, 'USD', 20_000n)
    const session = await findOrCreateSession(imf.id, teller.id)

    // 1. Teller requests sweep of 2,000 USD to vault
    const transfer = await VaultManagementService.requestSweep(
      vault.id,
      session,
      2_000n,
      teller,
      'End of day cash sweep'
    )

    assert.equal(transfer.status, 'requested')
    assert.equal(transfer.transferType, 'sweep')

    // 2. Manager approves sweep
    const initialVaultBalance = vault.balanceCache
    await VaultManagementService.approveTransfer(transfer, manager, 'test-corr-vault-3')

    assert.equal(transfer.status, 'approved')
    await vault.refresh()
    assert.equal(vault.balanceCache, initialVaultBalance + 2_000n)
  })
})
