import Agent from '#models/agent'

export class AgentNotFoundException extends Error {
  constructor() {
    super('User is not a registered agent')
    this.name = 'AgentNotFoundException'
  }
}

export class AgentNotActiveException extends Error {
  constructor(status: string) {
    super(`Agent account is not active (status: ${status})`)
    this.name = 'AgentNotActiveException'
  }
}

/**
 * Resolves the Agent record linked to an authenticated User.
 *
 * This is the single source of truth for "is this authenticated caller actually an agent" —
 * every endpoint that lets an agent act on behalf of the platform (confirming a cash-in,
 * confirming a cash-out payout, ...) MUST go through this instead of trusting `user.id` alone.
 */
export class AgentIdentityService {
  static async findActiveAgentForUser(userId: number): Promise<Agent | null> {
    const agent = await Agent.query().where('user_id', userId).first()
    if (!agent || agent.status !== 'active') {
      return null
    }
    return agent
  }

  /**
   * @throws AgentNotFoundException if the user has no linked agent record
   * @throws AgentNotActiveException if the linked agent isn't active
   */
  static async requireActiveAgentForUser(userId: number): Promise<Agent> {
    const agent = await Agent.query().where('user_id', userId).first()
    if (!agent) {
      throw new AgentNotFoundException()
    }
    if (agent.status !== 'active') {
      throw new AgentNotActiveException(agent.status)
    }
    return agent
  }

  /**
   * Resolves the Agent record for a user regardless of status — for pre-activation flows like
   * KYC submission, where the whole point is that the agent ISN'T active yet
   * (agent_lifecycle_service.ts's approve() requires an approved KYC before it will activate
   * one, so requireActiveAgentForUser() would be circular here: it can't be used to submit the
   * evidence that's a precondition for becoming active).
   *
   * @throws AgentNotFoundException if the user has no linked agent record
   */
  static async requireAgentForUser(userId: number): Promise<Agent> {
    const agent = await Agent.query().where('user_id', userId).first()
    if (!agent) {
      throw new AgentNotFoundException()
    }
    return agent
  }
}
