import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessVault from '#models/business_vault'
import VaultTransfer from '#models/vault_transfer'
import TellerSession from '#models/teller_session'
import TellerSessionBalance from '#models/teller_session_balance'
import type BusinessStaff from '#models/business_staff'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class VaultException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultException'
  }
}

/**
 * Vault and Physical Cash Management Service for Microfinance Institutions.
 *
 * Implements strict separation between Central Vault (Coffre Principal) and Teller Tills (Tiroirs Guichetiers)
 * with dual authorization (4-eyes principle).
 */
export class VaultManagementService {
  /**
   * Retrieves or initializes the central vault for an institution and currency.
   */
  static async getOrCreateVault(
    businessId: number,
    currencyCode: string,
    initialBalance = 0n
  ): Promise<BusinessVault> {
    let vault = await BusinessVault.query()
      .where('business_id', businessId)
      .where('currency_code', currencyCode)
      .first()

    if (!vault) {
      vault = new BusinessVault()
      vault.businessId = businessId
      vault.currencyCode = currencyCode
      vault.name = `Coffre Central ${currencyCode}`
      vault.balanceCache = initialBalance
      vault.status = 'active'
      await vault.save()
    }

    return vault
  }

  /**
   * Teller requests replenishment from central vault (Vault -> Till).
   */
  static async requestReplenishment(
    vaultId: number,
    tellerSession: TellerSession,
    amount: bigint,
    staff: BusinessStaff,
    notes?: string
  ): Promise<VaultTransfer> {
    if (amount <= 0n) throw new VaultException('Replenishment amount must be greater than zero')
    if (tellerSession.status !== 'open') {
      throw new VaultException('Cannot replenish a closed or reconciled teller session')
    }

    const vault = await BusinessVault.findOrFail(vaultId)
    if (vault.status !== 'active') throw new VaultException('Vault is locked or inactive')

    const transfer = new VaultTransfer()
    transfer.vaultId = vault.id
    transfer.tellerSessionId = tellerSession.id
    transfer.transferType = 'replenishment'
    transfer.currencyCode = vault.currencyCode
    transfer.amount = amount
    transfer.initiatedByStaffId = staff.id
    transfer.status = 'requested'
    transfer.notes = notes || null
    await transfer.save()

    return transfer
  }

  /**
   * Teller requests sweep / cash evacuation into central vault (Till -> Vault).
   */
  static async requestSweep(
    vaultId: number,
    tellerSession: TellerSession,
    amount: bigint,
    staff: BusinessStaff,
    notes?: string
  ): Promise<VaultTransfer> {
    if (amount <= 0n) throw new VaultException('Sweep amount must be greater than zero')
    if (tellerSession.status !== 'open') {
      throw new VaultException('Cannot sweep from a closed or reconciled teller session')
    }

    const vault = await BusinessVault.findOrFail(vaultId)

    const transfer = new VaultTransfer()
    transfer.vaultId = vault.id
    transfer.tellerSessionId = tellerSession.id
    transfer.transferType = 'sweep'
    transfer.currencyCode = vault.currencyCode
    transfer.amount = amount
    transfer.initiatedByStaffId = staff.id
    transfer.status = 'requested'
    transfer.notes = notes || null
    await transfer.save()

    return transfer
  }

  /**
   * Branch manager or vault custodian approves and executes a vault transfer.
   */
  static async approveTransfer(
    transfer: VaultTransfer,
    approverStaff: BusinessStaff,
    correlationId: string
  ): Promise<VaultTransfer> {
    if (transfer.status !== 'requested') {
      throw new VaultException(`Transfer cannot be approved in status '${transfer.status}'`)
    }

    // Dual authorization check: initiator cannot approve their own transfer
    if (transfer.initiatedByStaffId === approverStaff.id && approverStaff.role !== 'admin') {
      throw new VaultException('Dual control violation: the transfer initiator cannot self-approve')
    }

    return db.transaction(async (trx) => {
      const vault = await BusinessVault.query({ client: trx })
        .where('id', transfer.vaultId)
        .forUpdate()
        .firstOrFail()

      const session = await TellerSession.query({ client: trx })
        .where('id', transfer.tellerSessionId)
        .firstOrFail()

      const sessionBalance = await TellerSessionBalance.query({ client: trx })
        .where('teller_session_id', session.id)
        .where('currency_code', transfer.currencyCode)
        .first()

      if (transfer.transferType === 'replenishment') {
        // Vault -> Till
        if (vault.balanceCache < transfer.amount) {
          throw new VaultException(
            `Insufficient vault funds: available ${vault.balanceCache}, requested ${transfer.amount}`
          )
        }
        vault.balanceCache -= transfer.amount
        await vault.useTransaction(trx).save()

        // If session balance exists, adjust expected cash
        if (sessionBalance) {
          sessionBalance.openingCash += transfer.amount
          if (sessionBalance.expectedCash !== null) {
            sessionBalance.expectedCash += transfer.amount
          }
          await sessionBalance.useTransaction(trx).save()
        }
      } else {
        // Till -> Vault (Sweep)
        vault.balanceCache += transfer.amount
        await vault.useTransaction(trx).save()

        if (sessionBalance && sessionBalance.expectedCash !== null) {
          sessionBalance.expectedCash -= transfer.amount
          await sessionBalance.useTransaction(trx).save()
        }
      }

      transfer.status = 'approved'
      transfer.approvedByStaffId = approverStaff.id
      transfer.decidedAt = DateTime.now()
      await transfer.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: approverStaff.id,
        action: `vault.transfer.${transfer.transferType}`,
        resourceType: 'vault_transfer',
        resourceId: transfer.id,
        before: { status: 'requested' },
        after: {
          status: 'approved',
          vault_id: vault.id,
          vault_balance: vault.balanceCache.toString(),
          session_id: session.id,
          amount: transfer.amount.toString(),
          currency: transfer.currencyCode,
        },
        correlationId,
        trx,
      })

      return transfer
    })
  }

  /**
   * Rejects a vault transfer request.
   */
  static async rejectTransfer(
    transfer: VaultTransfer,
    rejecterStaff: BusinessStaff,
    notes: string,
    correlationId: string
  ): Promise<VaultTransfer> {
    if (transfer.status !== 'requested') {
      throw new VaultException(`Transfer cannot be rejected in status '${transfer.status}'`)
    }

    transfer.status = 'rejected'
    transfer.approvedByStaffId = rejecterStaff.id
    transfer.notes = notes
    transfer.decidedAt = DateTime.now()
    await transfer.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: rejecterStaff.id,
      action: 'vault.transfer.rejected',
      resourceType: 'vault_transfer',
      resourceId: transfer.id,
      before: { status: 'requested' },
      after: { status: 'rejected', notes },
      correlationId,
    })

    return transfer
  }
}
