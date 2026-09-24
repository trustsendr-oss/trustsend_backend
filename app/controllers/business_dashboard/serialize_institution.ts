import type Agent from '#models/agent'
import type BusinessStaff from '#models/business_staff'

/** A counter as the institution sees it. `is_head_office` is derived, not stored: the head office
 * is the top-level counter every other one hangs off (see InstitutionOutletService). */
export function serializeOutlet(
  agent: Agent,
  extra: {
    staffCount?: number
    openSession?: { id: number; opened_at: unknown; staff_name: string | null } | null
  } = {}
) {
  return {
    id: agent.id,
    code: agent.code,
    full_name: agent.fullName,
    phone: agent.phone,
    email: agent.email,
    city: agent.city,
    address: agent.address,
    tier: agent.tier,
    is_head_office: agent.parentAgentId === null,
    parent_agent_id: agent.parentAgentId,
    status: agent.status,
    suspended_at: agent.suspendedAt,
    suspension_reason: agent.suspensionReason,
    created_at: agent.createdAt,
    staff_count: extra.staffCount ?? null,
    open_session: extra.openSession ?? null,
  }
}

/** A staff member: who they are (their TumaPlus account), what they may do, and where. */
export function serializeStaff(staff: BusinessStaff) {
  return {
    id: staff.id,
    business_id: staff.businessId,
    user_id: staff.userId,
    agent_id: staff.agentId,
    role: staff.role,
    status: staff.status,
    user: staff.user
      ? {
          id: staff.user.id,
          code: staff.user.code,
          full_name: staff.user.fullName,
          email: staff.user.email,
          phone: staff.user.phone,
        }
      : null,
    agent: staff.agent
      ? {
          id: staff.agent.id,
          code: staff.agent.code,
          full_name: staff.agent.fullName,
          status: staff.agent.status,
        }
      : null,
    created_at: staff.createdAt,
    updated_at: staff.updatedAt,
  }
}
