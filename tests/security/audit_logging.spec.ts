import { test } from '@japa/runner'
import { ApiClient } from '@japa/api-client'
import Database from '@adonisjs/lucid/services/db'

test.group('Security: Audit Logging', (group) => {
  let api: ApiClient
  let adminUserToken: string
  let adminUserId: number
  let kycId: number
  let disputeId: number

  group.setup(async () => {
    api = new ApiClient({ baseURL: 'http://localhost:3330' })
  })

  group.each.setup(async () => {
    // Create admin user
    const adminRes = await api.post('/api/v1/auth/signup', {
      full_name: `Admin-${Date.now()}`,
      email: `admin-${Date.now()}@test.com`,
      password: 'Password123!',
      phone: '+1234567890',
      role: 'admin',
    })
    adminUserToken = adminRes.body().data.access_token
    adminUserId = adminRes.body().data.id

    // Create a KYC record for testing
    const kycInsert = await Database.table('kyc_verifications').insert({
      subject_type: 'user',
      subject_id: adminUserId,
      verification_type: 'identity',
      status: 'pending',
      submitted_at: new Date(),
    })
    kycId = kycInsert[0]

    // Create a dispute for testing
    // First create a transaction
    const txnInsert = await Database.table('ledger_transactions').insert({
      source_account_id: 1,
      destination_account_id: 2,
      amount: 1000,
      currency: 'USD',
      status: 'completed',
      created_at: new Date(),
    })
    const txnId = txnInsert[0]

    // Then create the dispute
    const disputeInsert = await Database.table('disputes').insert({
      ledger_transaction_id: txnId,
      raised_by_type: 'user',
      raised_by_id: adminUserId,
      reason: 'Testing audit logging',
      status: 'opened',
      opened_at: new Date(),
    })
    disputeId = disputeInsert[0]
  })

  test('Approving KYC creates audit log entry', async ({ assert }) => {
    // Clear audit logs
    await Database.table('audit_logs').delete()

    // Approve KYC
    const response = await api
      .post(`/api/v1/kyc/${kycId}/approve`)
      .header('Authorization', `Bearer ${adminUserToken}`)

    assert.equal(response.status(), 200)

    // Check audit log was created
    const auditLog = await Database.table('audit_logs')
      .where('action', 'kyc.approved')
      .where('actor_id', adminUserId)
      .first()

    assert.exists(auditLog, 'Audit log entry should exist')
    assert.equal(auditLog.actor_type, 'internal_user')
    assert.equal(auditLog.resource_type, 'kyc_verification')
    assert.equal(auditLog.resource_id, kycId)
  })

  test('Rejecting KYC creates audit log entry', async ({ assert }) => {
    // Create another KYC for rejection test
    const kycInsert = await Database.table('kyc_verifications').insert({
      subject_type: 'user',
      subject_id: adminUserId,
      verification_type: 'identity',
      status: 'pending',
      submitted_at: new Date(),
    })
    const testKycId = kycInsert[0]

    // Clear audit logs
    await Database.table('audit_logs').delete()

    // Reject KYC
    const response = await api
      .post(`/api/v1/kyc/${testKycId}/reject`)
      .header('Authorization', `Bearer ${adminUserToken}`)
      .json({
        reason: 'Failed identity verification',
      })

    assert.equal(response.status(), 200)

    // Check audit log was created
    const auditLog = await Database.table('audit_logs')
      .where('action', 'kyc.rejected')
      .where('actor_id', adminUserId)
      .first()

    assert.exists(auditLog, 'Audit log entry should exist')
    assert.equal(auditLog.actor_type, 'internal_user')
    assert.equal(auditLog.resource_type, 'kyc_verification')
  })

  test('Closing dispute creates audit log entry', async ({ assert }) => {
    // Clear audit logs
    await Database.table('audit_logs').delete()

    // Close dispute
    const response = await api
      .post(`/api/v1/disputes/${disputeId}/close`)
      .header('Authorization', `Bearer ${adminUserToken}`)
      .json({
        resolution_notes: 'Dispute resolved in favor of user',
      })

    assert.equal(response.status(), 200)

    // Check audit log was created
    const auditLog = await Database.table('audit_logs')
      .where('action', 'dispute.closed')
      .where('actor_id', adminUserId)
      .first()

    assert.exists(auditLog, 'Audit log entry should exist')
    assert.equal(auditLog.actor_type, 'internal_user')
    assert.equal(auditLog.resource_type, 'dispute')
    assert.equal(auditLog.resource_id, disputeId)
  })

  test('KYC approval logs reviewer ID', async ({ assert }) => {
    // Create new KYC
    const kycInsert = await Database.table('kyc_verifications').insert({
      subject_type: 'user',
      subject_id: adminUserId,
      verification_type: 'identity',
      status: 'pending',
      submitted_at: new Date(),
    })
    const testKycId = kycInsert[0]

    // Approve KYC
    await api
      .post(`/api/v1/kyc/${testKycId}/approve`)
      .header('Authorization', `Bearer ${adminUserToken}`)

    // Verify KYC record has reviewed_by field set
    const kyc = await Database.table('kyc_verifications').where('id', testKycId).first()

    assert.exists(kyc.reviewed_by, 'KYC should have reviewed_by field set')
    assert.equal(kyc.reviewed_by, adminUserId)
  })

  test('Dispute closure logs resolver ID', async ({ assert }) => {
    // Close dispute
    await api
      .post(`/api/v1/disputes/${disputeId}/close`)
      .header('Authorization', `Bearer ${adminUserToken}`)
      .json({
        resolution_notes: 'Resolved',
      })

    // Verify dispute record has assignedTo field set
    const dispute = await Database.table('disputes').where('id', disputeId).first()

    assert.exists(dispute.assigned_to, 'Dispute should have assigned_to field set')
    assert.equal(dispute.assigned_to, adminUserId)
  })

  test('Audit logs include before/after state', async ({ assert }) => {
    // Create new KYC
    const kycInsert = await Database.table('kyc_verifications').insert({
      subject_type: 'user',
      subject_id: adminUserId,
      verification_type: 'identity',
      status: 'pending',
      submitted_at: new Date(),
    })
    const testKycId = kycInsert[0]

    // Clear audit logs
    await Database.table('audit_logs').delete()

    // Approve KYC
    await api
      .post(`/api/v1/kyc/${testKycId}/approve`)
      .header('Authorization', `Bearer ${adminUserToken}`)

    // Check audit log contains before/after
    const auditLog = await Database.table('audit_logs').where('action', 'kyc.approved').first()

    assert.exists(auditLog.before, 'Audit log should contain before state')
    assert.exists(auditLog.after, 'Audit log should contain after state')

    // Parse JSON fields
    const before =
      typeof auditLog.before === 'string' ? JSON.parse(auditLog.before) : auditLog.before
    const after = typeof auditLog.after === 'string' ? JSON.parse(auditLog.after) : auditLog.after

    assert.equal(before.status, 'pending', 'Before state should show pending')
    assert.equal(after.status, 'approved', 'After state should show approved')
  })
})
