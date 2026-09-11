import { test } from '@japa/runner'
import { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'

test.group('Security: Permission Bypass Protection', (group) => {
  let api: ApiClient
  let regularUserToken: string
  let adminUserToken: string
  let agentId: number

  group.setup(async () => {
    api = new ApiClient({ baseURL: 'http://localhost:3333' })
  })

  group.each.setup(async () => {
    // Create regular user and get token
    const regularRes = await api.post('/api/v1/auth/signup', {
      full_name: 'Regular User',
      email: `user-${Date.now()}@test.com`,
      password: 'Password123!',
      phone: '+1234567890',
    })
    regularUserToken = regularRes.body().data.access_token

    // Create admin user (InternalUser) and get token
    const adminRes = await api.post('/api/v1/auth/signup', {
      full_name: 'Admin User',
      email: `admin-${Date.now()}@test.com`,
      password: 'Password123!',
      phone: '+1234567890',
      role: 'admin', // This should create an InternalUser
    })
    adminUserToken = adminRes.body().data.access_token
  })

  test('Regular user cannot list agents - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .get('/api/v1/agents')
      .header('Authorization', `Bearer ${regularUserToken}`)

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Regular user cannot create agent - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .post('/api/v1/agents')
      .header('Authorization', `Bearer ${regularUserToken}`)
      .json({
        full_name: 'Test Agent',
        email: `agent-${Date.now()}@test.com`,
        phone: '+1234567890',
      })

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Regular user cannot view agent details - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .get('/api/v1/agents/1')
      .header('Authorization', `Bearer ${regularUserToken}`)

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Regular user cannot update agent - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .patch('/api/v1/agents/1')
      .header('Authorization', `Bearer ${regularUserToken}`)
      .json({
        full_name: 'Updated Name',
      })

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Regular user cannot activate agent - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .post('/api/v1/agents/1/activate')
      .header('Authorization', `Bearer ${regularUserToken}`)

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Regular user cannot suspend agent - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .post('/api/v1/agents/1/suspend')
      .header('Authorization', `Bearer ${regularUserToken}`)
      .json({
        reason: 'Testing suspension',
      })

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Regular user cannot deactivate agent - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .post('/api/v1/agents/1/deactivate')
      .header('Authorization', `Bearer ${regularUserToken}`)
      .json({
        reason: 'Testing deactivation',
      })

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Regular user cannot approve KYC - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .post('/api/v1/kyc/1/approve')
      .header('Authorization', `Bearer ${regularUserToken}`)

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Regular user cannot reject KYC - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .post('/api/v1/kyc/1/reject')
      .header('Authorization', `Bearer ${regularUserToken}`)
      .json({
        reason: 'Failed verification',
      })

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Regular user cannot close dispute - 403 Forbidden', async ({ assert }) => {
    const response = await api
      .post('/api/v1/disputes/1/close')
      .header('Authorization', `Bearer ${regularUserToken}`)
      .json({
        resolution_notes: 'Dispute resolved',
      })

    assert.equal(response.status(), 403)
    assert.include(response.body(), 'Admin access required')
  })

  test('Admin user CAN list agents - 200 OK', async ({ assert }) => {
    const response = await api
      .get('/api/v1/agents')
      .header('Authorization', `Bearer ${adminUserToken}`)

    assert.equal(response.status(), 200)
  })

  test('Admin user CAN create agent - 201 Created', async ({ assert }) => {
    const response = await api
      .post('/api/v1/agents')
      .header('Authorization', `Bearer ${adminUserToken}`)
      .json({
        full_name: 'Test Agent',
        email: `agent-${Date.now()}@test.com`,
        phone: '+1234567890',
      })

    assert.equal(response.status(), 201)
    assert.exists(response.body().data.id)
  })

  test('Unauthenticated user cannot access admin endpoints - 401 Unauthorized', async ({
    assert,
  }) => {
    const response = await api.get('/api/v1/agents')

    assert.equal(response.status(), 401)
  })
})
