import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Onboards a microfinance institution, its head office and its counters in one pass.
 *
 * Institutions never arrive through the public signup, which only ever creates merchants (see
 * business_dashboard/auth_controller.ts): taking one on is a commercial and regulatory decision,
 * and its KYB is recorded by TumaPlus staff on its behalf rather than uploaded by the institution.
 * This command is that path.
 *
 * It exists because the sequence is not obvious and is easy to get wrong by hand. An institution
 * cannot be approved before its KYB is on file; a counter cannot be created before the head office
 * that sponsors it; and that head office must be active — which needs its own KYC — before it can
 * sponsor anything. `tier_parent_hierarchy` also forbids an `agent` at the root of a network, so
 * the head office takes the `distributor` tier, which is what later lets FloatTransferService push
 * float from the institution down to its counters.
 *
 *   node ace imf:create "IMF Kivu" --email=contact@imfkivu.cd --phone=+243990000000 --counters=3
 *
 * Every generated password is printed once and never stored in retrievable form.
 */
export default class CreateImf extends BaseCommand {
  static commandName = 'imf:create'
  static description = 'Onboard a microfinance institution with its head office and counters'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Institution name, e.g. "IMF Kivu"' })
  declare name: string

  @flags.string({ description: 'Contact email for the institution', required: true })
  declare email: string

  @flags.string({ description: 'Contact phone for the institution', required: true })
  declare phone: string

  @flags.number({ description: 'How many counters to open under the head office', default: 1 })
  declare counters: number

  @flags.string({ description: 'Institution code; generated when omitted' })
  declare code: string

  @flags.string({ description: 'City the head office sits in' })
  declare city: string

  @flags.string({
    description:
      'Email of the staff account recorded as approver; defaults to the first active one',
  })
  declare admin: string

  @flags.string({ description: 'Plan code granting what it may sell', default: 'imf_standard' })
  declare plan: string

  async run() {
    // Imported lazily: ace loads command files before the application boots, and the models'
    // withAuthFinder(hash) mixin needs the hash service, which only exists once it has.
    const { default: Business } = await import('#models/business')
    const { default: InternalUser } = await import('#models/internal_user')
    const { default: KycVerification } = await import('#models/kyc_verification')
    const { default: Plan } = await import('#models/plan')
    const { BusinessOnboardingService } =
      await import('#services/business/business_onboarding_service')
    const { BusinessLifecycleService } =
      await import('#services/business/business_lifecycle_service')
    const { AgentOnboardingService } = await import('#services/agents/agent_onboarding_service')
    const { AgentLifecycleService } = await import('#services/agents/agent_lifecycle_service')
    const { PlanService } = await import('#services/business/plan_service')
    const { IdGenerator } = await import('#services/security/id_generator')
    const { DateTime } = await import('luxon')

    const name = this.name.trim()
    const email = this.email.trim().toLowerCase()
    const correlationId = `imf-create-${Date.now()}`

    if (name.length < 2) {
      this.logger.error('The institution name must contain at least 2 characters')
      this.exitCode = 1
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.logger.error(`Invalid email address: ${this.email}`)
      this.exitCode = 1
      return
    }
    if (this.counters < 0 || this.counters > 50) {
      this.logger.error('--counters must be between 0 and 50')
      this.exitCode = 1
      return
    }
    if (await Business.findBy('email', email)) {
      this.logger.error(`A business already exists for ${email}`)
      this.exitCode = 1
      return
    }

    // Every approval below is attributed to a real staff account: who let an institution onto the
    // platform has to be answerable later, so this refuses rather than inventing an actor.
    const approver = this.admin
      ? await InternalUser.findBy('email', this.admin.trim().toLowerCase())
      : await InternalUser.query().where('status', 'active').orderBy('id', 'asc').first()

    if (!approver) {
      this.logger.error(
        this.admin
          ? `No staff account found for ${this.admin}`
          : 'No active staff account exists — create one first with: node ace internal:create-admin'
      )
      this.exitCode = 1
      return
    }

    const plan = await Plan.findBy('code', this.plan)
    if (!plan) {
      this.logger.error(`No plan with code "${this.plan}". Seeded plans include imf_standard.`)
      this.exitCode = 1
      return
    }

    /** Records a KYB/KYC decision made by staff, which both approval gates require on file. */
    const recordVerification = async (subjectType: 'business' | 'agent', subjectId: number) => {
      const kyc = new KycVerification()
      kyc.subjectType = subjectType
      kyc.subjectId = subjectId
      kyc.verificationType = 'document'
      kyc.status = 'approved'
      kyc.decisionReason = `Recorded by ${approver.email} via imf:create`
      kyc.submittedAt = DateTime.now()
      kyc.decidedAt = DateTime.now()
      kyc.reviewedBy = approver.id
      await kyc.save()
    }

    // Only the institution's own dashboard login: no other account is created any more.
    const credentials: Array<{ who: string; login: string; password: string }> = []

    // 1 — the institution itself, labelled as one from the start.
    const code = this.code?.trim() || IdGenerator.generateId('IMF')
    const { business, generatedPassword } = await BusinessOnboardingService.create({
      code,
      name,
      email,
      phone: this.phone.trim(),
      kind: 'imf',
      correlationId,
    })
    if (generatedPassword) {
      credentials.push({ who: `${name} (dashboard)`, login: email, password: generatedPassword })
    }
    this.logger.success(`Institution ${business.code} created (id ${business.id})`)

    // 2 — its KYB, entered by staff, then approval. The gate is real: BusinessLifecycleService
    // refuses to approve a business with no approved verification on file.
    if (business.status === 'pending_approval') {
      await recordVerification('business', business.id)
      await BusinessLifecycleService.approve(business.id, approver.id, correlationId)
      await business.refresh()
    }
    this.logger.success(`KYB recorded by ${approver.email}; institution is ${business.status}`)

    // 3 — the plan, which is what actually grants the right to sell credit. `kind` only labels.
    await PlanService.assignToBusiness(business.id, plan.id, approver.id, correlationId)
    this.logger.success(`Plan ${plan.code} assigned`)

    /**
     * A counter is a place, not a person. It gets no account of its own — whoever stands at it is
     * a business_staff row posted to it, resolved by BusinessStaffIdentityService. Minting a
     * throwaway login per outlet, as an earlier version of this command did, only duplicated the
     * people that posting already models.
     *
     * The address is the outlet's contact, never a credential: agents.email is NOT NULL and
     * unique, and derived per outlet so two counters of the same institution do not collide.
     */
    const openOutlet = async (
      label: string,
      tier: 'distributor' | 'agent',
      parentAgentId?: number
    ) => {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const outletEmail = `${slug}.${code.toLowerCase()}@${email.split('@')[1]}`

      const agent = await AgentOnboardingService.create({
        businessId: business.id,
        fullName: label,
        email: outletEmail,
        phone: this.phone.trim(),
        tier,
        parentAgentId,
        city: this.city?.trim(),
        businessName: label,
        correlationId,
      })

      await recordVerification('agent', agent.id)
      await AgentLifecycleService.approve(agent.id, approver.id, correlationId)
      await agent.refresh()
      return agent
    }

    // 4 — the head office. tier_parent_hierarchy only allows master or distributor at the root of
    // a network, and distributor is also what lets float be pushed down to the counters.
    const head = await openOutlet(`${name} — Siege`, 'distributor')
    this.logger.success(`Head office ${head.code} opened and active`)

    // 5 — the counters, each sponsored by the head office.
    const counters = []
    for (let i = 1; i <= this.counters; i++) {
      const counter = await openOutlet(`${name} — Guichet ${i}`, 'agent', head.id)
      counters.push(counter)
      this.logger.success(`Counter ${counter.code} opened and active`)
    }

    this.logger.log('')
    this.logger.log(this.colors.bold('Institution'))
    this.logger.log(`  name      ${name}`)
    this.logger.log(`  code      ${business.code}`)
    this.logger.log(`  kind      ${business.kind}`)
    this.logger.log(`  status    ${business.status}`)
    this.logger.log(`  plan      ${plan.code}`)
    this.logger.log(`  wallet    #${business.walletId} (USD)`)
    this.logger.log('')
    this.logger.log(this.colors.bold('Network'))
    this.logger.log(`  head office  ${head.code}  ${head.fullName}`)
    for (const counter of counters) {
      this.logger.log(`  counter      ${counter.code}  ${counter.fullName}`)
    }
    this.logger.log('')
    this.logger.log(this.colors.bold('Credentials — shown once, not retrievable afterwards'))
    for (const entry of credentials) {
      this.logger.log(`  ${entry.who}`)
      this.logger.log(`    login     ${entry.login}`)
      this.logger.log(`    password  ${entry.password}`)
    }
    this.logger.log('')
    this.logger.log('')
    this.logger.info(
      'Counters have no login of their own — post staff to them (admin > Institution staff) before they can take cash.'
    )
    this.logger.info(
      'Then the institution drafts its products from its dashboard, and you publish them from admin > Financial products.'
    )
  }
}
