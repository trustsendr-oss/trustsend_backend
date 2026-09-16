import type { KycDocumentType } from '#models/kyc_document'

export type KycVerificationType = 'identity' | 'address' | 'liveness' | 'document' | 'pep_screening'

/**
 * What actually satisfies each verification_type — the real business rule a KYC platform
 * enforces, instead of "attach one file called document and call it done".
 *
 * Each verification_type maps to a list of acceptable COMBINATIONS. A submission is valid if
 * it fully satisfies at least one combination (e.g. "passport" alone is enough for identity, OR
 * "id_card_front" + "id_card_back" together, but not id_card_front alone).
 *
 * pep_screening has no combinations at all — it's a watchlist/database check, not evidence a
 * subject uploads, so no file is required for it.
 */
export const KYC_REQUIRED_DOCUMENT_COMBINATIONS: Record<KycVerificationType, KycDocumentType[][]> =
  {
    identity: [
      ['passport'],
      ['id_card_front', 'id_card_back'],
      ['driver_license_front', 'driver_license_back'],
      ['representative_id_front', 'representative_id_back'], // business's representative
    ],
    address: [['proof_of_address']],
    liveness: [['selfie']],
    document: [['business_registration_certificate'], ['tax_identification_certificate']],
    pep_screening: [],
  }

/**
 * Checks whether the set of document types actually present in a submission satisfies the
 * verification_type's requirement. Returns the satisfied combination (for a clear success
 * message) or null if nothing matches.
 */
export function findSatisfiedCombination(
  verificationType: KycVerificationType,
  presentTypes: KycDocumentType[]
): KycDocumentType[] | null {
  const combinations = KYC_REQUIRED_DOCUMENT_COMBINATIONS[verificationType]

  if (combinations.length === 0) {
    return [] // pep_screening — trivially satisfied, no documents needed
  }

  const presentSet = new Set(presentTypes)
  for (const combination of combinations) {
    if (combination.every((type) => presentSet.has(type))) {
      return combination
    }
  }

  return null
}

/** Human-readable description of what's accepted, for error messages and API docs alike. */
export function describeRequirement(verificationType: KycVerificationType): string {
  const combinations = KYC_REQUIRED_DOCUMENT_COMBINATIONS[verificationType]
  if (combinations.length === 0) {
    return 'No document required for pep_screening.'
  }
  return combinations.map((combo) => combo.join(' + ')).join(', or ')
}
