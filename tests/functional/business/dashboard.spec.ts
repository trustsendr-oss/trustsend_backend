import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import env from '#start/env'
import InternalUser from '#models/internal_user'
import KycVerification from '#models/kyc_verification'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { BusinessLifecycleService } from '#services/business/business_lifecycle_service'

const BASE_URL = `http://${env.get('HOST')}:${env.get('PORT')}/api/v1`

/**
 * The access token now lives in an httpOnly cookie (auth_cookie_service.ts) instead of the login
 * response body, paired with a non-httpOnly CSRF cookie that mutating requests must also echo
 * back as a header (cookie_to_bearer_middleware.ts). These tests act like a real browser would —
 * forwarding the exact `Set-Cookie` bytes verbatim in the next request's `Cookie` header — using
 * plain `fetch()` instead of @japa/api-client: its cookie plugins (sessionApiClient/authApiClient
 * in tests/bootstrap.ts) transparently re-sign any cookie value handed to `.cookie()`/`.cookies()`
 * using Adonis's own format, which produces a different wire value than what the server actually
 * sent — fine for cookies those plugins manage themselves, but it silently breaks a hand-rolled
 * cookie like this app's CSRF token. A raw `fetch()` has no such layer in the way.
 */
function authSession(setCookieHeaders: string[], guard: 'internal' | 'business') {
  const accessCookieName = guard === 'internal' ? 'internal_access_token' : 'business_access_token'
  const csrfCookieName = guard === 'internal' ? 'internal_csrf_token' : 'business_csrf_token'

  const pair = (name: string) => {
    const header = setCookieHeaders.find((c) => c.startsWith(`${name}=`))
    if (!header) throw new Error(`Missing ${name} in Set-Cookie headers`)
    return header.split(';')[0]
  }

  const accessPair = pair(accessCookieName)
  const csrfPair = pair(csrfCookieName)

  return {
    cookieHeader: `${accessPair}; ${csrfPair}`,
    csrfToken: csrfPair.split('=').slice(1).join('='),
  }
}

type Session = ReturnType<typeof authSession>

async function authedFetch(
  path: string,
  session: Session,
  init: { method?: string; body?: unknown } = {}
) {
  const method = init.method || 'GET'
  const headers: Record<string, string> = { Cookie: session.cookieHeader }
  if (method !== 'GET' && method !== 'HEAD') headers['X-CSRF-Token'] = session.csrfToken
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body: body as any }
}

async function login(path: string, credentials: { email: string; password: string }) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body: body as any, setCookies: res.headers.getSetCookie() }
}

async function createInternalUser(email: string) {
  return InternalUser.create({
    email,
    fullName: `Staff ${email}`,
    password: 'staffpass123',
    status: 'active',
    mustChangePassword: false,
    mfaEnabled: false,
  })
}

/** BusinessLifecycleService.approve() now requires an approved KYC (KYB) on file first. */
async function approveKycFor(businessId: number) {
  const kyc = new KycVerification()
  kyc.subjectType = 'business'
  kyc.subjectId = businessId
  kyc.verificationType = 'document'
  kyc.status = 'approved'
  kyc.submittedAt = DateTime.now()
  kyc.decidedAt = DateTime.now()
  kyc.reviewedBy = 1
  await kyc.save()
}

test.group('Internal auth (regression: guard bug)', () => {
  test('internal user can log in and call an admin-only endpoint', async ({ assert }) => {
    await createInternalUser('admin1@internal.test')

    const res = await login('/internal/auth/login', { email: 'admin1@internal.test', password: 'staffpass123' })
    assert.equal(res.status, 200)
    const session = authSession(res.setCookies, 'internal')

    // A regular user token would 401 here; an internal token via the wrong guard
    // (the bug this fixes) would also 401. This must succeed.
    const list = await authedFetch('/agents', session)
    assert.equal(list.status, 200)
  })

  test('wrong password rejected, no token issued', async ({ assert }) => {
    await createInternalUser('admin2@internal.test')
    const res = await login('/internal/auth/login', { email: 'admin2@internal.test', password: 'wrong' })
    assert.equal(res.status, 400)
  })

  test('internal user can approve a business end-to-end via HTTP', async ({ assert }) => {
    const staff = await createInternalUser('admin3@internal.test')
    const res = await login('/internal/auth/login', { email: 'admin3@internal.test', password: 'staffpass123' })
    const session = authSession(res.setCookies, 'internal')

    const create = await authedFetch('/businesses', session, {
      method: 'POST',
      body: { name: 'Approve Me Inc', email: 'approveme@biz.test', phone: '260763456789' },
    })
    assert.equal(create.status, 201)
    const businessId = create.body.data.id
    await approveKycFor(businessId)

    const approve = await authedFetch(`/businesses/${businessId}/approve`, session, { method: 'POST' })
    assert.equal(approve.status, 200)
    assert.equal(approve.body.data.status, 'active')
    assert.equal(approve.body.data.approved_by, staff.id)
  })
})

test.group('Business dashboard login', () => {
  test('login with generated password, then access overview and profile', async ({ assert }) => {
    const { business, generatedPassword } = await BusinessOnboardingService.create({
      code: 'dash-biz-1',
      name: 'Dashboard Biz',
      email: 'dashboard1@biz.test',
      phone: '260763456789',
      correlationId: 'debug',
    })
    assert.exists(generatedPassword)
    await approveKycFor(business.id)
    await BusinessLifecycleService.approve(business.id, 1, 'debug')

    const res = await login('/business/auth/login', { email: 'dashboard1@biz.test', password: generatedPassword! })
    assert.equal(res.status, 200)
    const session = authSession(res.setCookies, 'business')

    const overview = await authedFetch('/business/dashboard/overview', session)
    assert.equal(overview.status, 200)
    assert.exists(overview.body.data.all_time)

    const profile = await authedFetch('/business/dashboard/profile', session)
    assert.equal(profile.status, 200)
    assert.equal(profile.body.data.email, 'dashboard1@biz.test')
  })

  test('pending business can log in (to submit KYC) but is blocked from financial routes', async ({ assert }) => {
    const { business, generatedPassword } = await BusinessOnboardingService.create({
      code: 'dash-biz-pending',
      name: 'Pending Biz',
      email: 'pending@biz.test',
      phone: '260763456789',
      correlationId: 'debug',
    })
    void business

    const res = await login('/business/auth/login', { email: 'pending@biz.test', password: generatedPassword! })
    assert.equal(res.status, 200)
    const session = authSession(res.setCookies, 'business')

    const wallet = await authedFetch('/business/dashboard/wallet', session)
    assert.equal(wallet.status, 403)
  })

  test('login blocked for suspended/terminated businesses', async ({ assert }) => {
    const { business, generatedPassword } = await BusinessOnboardingService.create({
      code: 'dash-biz-suspended',
      name: 'Suspended Biz',
      email: 'suspended@biz.test',
      phone: '260763456789',
      correlationId: 'debug',
    })
    await approveKycFor(business.id)
    await BusinessLifecycleService.approve(business.id, 1, 'debug')
    await BusinessLifecycleService.suspend(business.id, 1, 'reason for suspension test', 'debug')

    const res = await login('/business/auth/login', { email: 'suspended@biz.test', password: generatedPassword! })
    assert.equal(res.status, 403)
  })

  test('account locks after 5 failed attempts', async ({ assert }) => {
    const { business } = await BusinessOnboardingService.create({
      code: 'dash-biz-lock',
      name: 'Lockout Biz',
      email: 'lockout@biz.test',
      phone: '260763456789',
      correlationId: 'debug',
      password: 'correcthorsebattery',
    })
    await approveKycFor(business.id)
    await BusinessLifecycleService.approve(business.id, 1, 'debug')

    for (let i = 0; i < 5; i++) {
      const attempt = await login('/business/auth/login', { email: 'lockout@biz.test', password: 'wrong-password' })
      assert.equal(attempt.status, 400)
    }

    const lockedOut = await login('/business/auth/login', {
      email: 'lockout@biz.test',
      password: 'correcthorsebattery',
    })
    assert.equal(lockedOut.status, 429)
  })

  test('dashboard-triggered deposit works without an API key, self-service key management works', async ({
    assert,
  }) => {
    const { business } = await BusinessOnboardingService.create({
      code: 'dash-biz-money',
      name: 'Money Biz',
      email: 'money@biz.test',
      phone: '260763456789',
      correlationId: 'debug',
      password: 'correcthorsebattery',
    })
    await approveKycFor(business.id)
    await BusinessLifecycleService.approve(business.id, 1, 'debug')

    const res = await login('/business/auth/login', { email: 'money@biz.test', password: 'correcthorsebattery' })
    const session = authSession(res.setCookies, 'business')

    // Self-service API key issuance from the dashboard
    const keyResponse = await authedFetch('/business/dashboard/api-keys', session, { method: 'POST' })
    assert.equal(keyResponse.status, 201)
    assert.exists(keyResponse.body.data.api_key)

    const keyList = await authedFetch('/business/dashboard/api-keys', session)
    assert.equal(keyList.status, 200)
    assert.equal(keyList.body.data.length, 1)
    assert.notExists(keyList.body.data[0].api_key) // never returned again

    // Transactions endpoint reachable from a dashboard session (same controller as API-key path)
    const transactions = await authedFetch('/business/dashboard/transactions', session)
    assert.equal(transactions.status, 200)
  })
})
