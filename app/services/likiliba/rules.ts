import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Likiliba from '#models/likiliba'
import LikilibaRuleVersion from '#models/likiliba_rule_version'
import { formatAmount } from '#services/notifications/transaction_notifier'
import {
  bpsOf,
  canonicalJson,
  formatDate,
  FREQUENCY_LABEL,
  sha256,
} from '#services/likiliba/shared'

export type RosterEntry = { member_id: number; user_id: number; name: string }

/**
 * The rules a member signs: the structured terms the services enforce, and the same terms in
 * plain French. Both come from one place, so what members read is what the code applies.
 *
 * The commission rate is frozen into the terms: a change to the fee schedule never reaches a
 * group whose members already agreed to a rate.
 */
export class LikilibaRules {
  static terms(
    likiliba: Likiliba,
    commissionBps: number,
    extra: { roster?: RosterEntry[]; manualOrder?: number[] } = {}
  ) {
    return {
      currency_code: likiliba.currencyCode,
      contribution_amount: likiliba.contributionAmount.toString(),
      size: likiliba.size,
      frequency: likiliba.frequency,
      starts_at: likiliba.startsAt.toUTC().toISO(),
      round_amount: likiliba.roundAmount.toString(),
      commission_bps: commissionBps,
      caution_required: likiliba.cautionRequired,
      caution_multiplier: likiliba.cautionMultiplier,
      caution_amount: likiliba.cautionAmount.toString(),
      grace_hours: likiliba.graceHours,
      escalation_days: likiliba.escalationDays,
      penalty_mode: likiliba.penaltyMode,
      penalty_fixed_amount: likiliba.penaltyFixedAmount?.toString() ?? null,
      penalty_daily_bps: likiliba.penaltyDailyBps,
      penalty_cap_bps: likiliba.penaltyCapBps,
      ordering_mode: likiliba.orderingMode,
      draw_seed_hash: likiliba.drawSeedHash,
      roster: extra.roster ?? null,
      manual_order: extra.manualOrder ?? null,
    }
  }

  static clauses(
    likiliba: Likiliba,
    commissionBps: number,
    roster?: RosterEntry[],
    order?: number[]
  ): string[] {
    const cur = likiliba.currencyCode
    const c = likiliba.contributionAmount
    const amount = (v: bigint) => formatAmount(v, cur)
    const gross = likiliba.roundAmount
    const commission = bpsOf(gross, commissionBps)
    const pct = (commissionBps / 100).toLocaleString('fr-FR')

    const clauses: string[] = [
      `Devise : ${cur}. Toutes les cotisations, cautions, pénalités et versements de ce groupe se font en ${cur}, sans conversion.`,
      `Cotisation : ${amount(c)} par membre, ${FREQUENCY_LABEL[likiliba.frequency]}, pendant ${likiliba.size} tours — un tour par membre.`,
      `À chaque tour, un seul membre reçoit. Il ne cotise pas pour son propre tour : il reçoit les cotisations des ${likiliba.size - 1} autres membres, soit ${amount(gross)} brut.`,
      `Commission Reemite : ${pct} % du versement brut, prélevée une seule fois sur un versement réussi, soit ${amount(commission)} par tour. Le bénéficiaire reçoit ${amount(gross - commission)} net, moins ses éventuelles dettes envers le groupe. Les cotisations, les cautions et les pénalités sont gratuites.`,
      `Calendrier : le premier tour est dû le ${formatDate(likiliba.startsAt)}, les suivants ${FREQUENCY_LABEL[likiliba.frequency]}. Si le cycle démarre après cette date, ou si un tour est versé après la fin de son délai de grâce, tout le calendrier qui suit est décalé d'autant.`,
      `Le versement n'a lieu qu'une fois la cagnotte complète, à la date du tour au plus tôt. Aucun versement partiel n'est jamais fait. Chaque membre reçoit une seule fois par cycle.`,
      `Délai de grâce : ${likiliba.graceHours} heures après la date du tour pour payer sans conséquence.`,
    ]

    if (likiliba.orderingMode === 'draw') {
      clauses.push(
        likiliba.drawSeedHash
          ? `Ordre de passage : tiré au sort au démarrage. L'empreinte du tirage, ${likiliba.drawSeedHash}, est fixée avant votre signature ; la graine est révélée au démarrage, pour que chacun puisse vérifier que l'ordre n'a pas été choisi.`
          : `Ordre de passage : tiré au sort au démarrage, selon un tirage vérifiable dont l'empreinte est publiée au verrouillage du groupe.`
      )
    } else {
      const names = new Map((roster ?? []).map((r) => [r.member_id, r.name]))
      clauses.push(
        order && order.length > 0
          ? `Ordre de passage, approuvé par la signature de chaque membre : ${order.map((id, i) => `${i + 1}. ${names.get(id) ?? `membre ${id}`}`).join(' ; ')}. L'organisateur ne peut pas être premier.`
          : `Ordre de passage : fixé par l'organisateur au verrouillage du groupe, puis approuvé par la signature de chaque membre. L'organisateur ne peut pas se placer en premier.`
      )
    }
    clauses.push(
      `Une fois le cycle démarré, l'ordre de passage, les membres et ces règles ne changent plus.`
    )

    if (likiliba.cautionRequired) {
      clauses.push(
        `Caution obligatoire : chaque membre bloque ${amount(likiliba.cautionAmount)} en signant. Elle reste à son nom, ne peut pas être dépensée pendant le cycle, et lui est rendue à la fin.`,
        `Cotisation manquante après le délai de grâce : elle est payée d'abord par la caution du membre en retard, puis, si elle ne suffit pas, par les cautions des autres membres au prorata de leur solde. Le membre en retard doit alors rembourser cette avance.`,
        `Remboursement de l'avance : à tout moment par le membre lui-même ; sinon, retenu sur son propre versement s'il n'a pas encore reçu ; sinon, pris sur sa caution en fin de cycle. Ce qui reste impayé à la fin est supporté par les cautions qui l'ont avancé.`,
        `Si les cautions ne suffisent plus, le tour attend la régularisation ; au-delà de ${likiliba.escalationDays} jours d'attente, le groupe est suspendu et le support Reemite intervient.`
      )
    } else {
      clauses.push(
        `Pas de caution : ce groupe ne bloque aucune caution. Si une cotisation manque après le délai de grâce, personne ne l'avance : le tour attend que le membre en retard régularise, et le versement du bénéficiaire est retardé d'autant.`,
        `Au-delà de ${likiliba.escalationDays} jours d'attente, le groupe est suspendu et le support Reemite intervient.`
      )
    }

    if (likiliba.penaltyMode === 'none') {
      clauses.push(`Pénalités : aucune pénalité de retard dans ce groupe.`)
    } else {
      const daily =
        likiliba.penaltyMode === 'fixed'
          ? amount(likiliba.penaltyFixedAmount ?? 0n)
          : `${((likiliba.penaltyDailyBps ?? 0) / 100).toLocaleString('fr-FR')} % de la cotisation (${amount(bpsOf(c, likiliba.penaltyDailyBps ?? 0))})`
      clauses.push(
        `Pénalités : ${daily} par jour de retard, comptés à partir de la fin du délai de grâce, tant que la cotisation (ou l'avance qui l'a couverte) n'est pas réglée. Plafond : ${(likiliba.penaltyCapBps / 100).toLocaleString('fr-FR')} % de la cotisation, soit ${amount(bpsOf(c, likiliba.penaltyCapBps))} au maximum par cotisation.`,
        `Les pénalités sont versées au bénéficiaire du tour en retard, en compensation de son attente. Reemite n'en garde rien. Une pénalité que le solde du membre ne couvre pas devient une dette envers ce bénéficiaire.`
      )
    }

    clauses.push(
      `Prélèvement automatique : facultatif. S'il est accepté, la cotisation est prélevée à la date du tour, puis toutes les 24 heures jusqu'à la fin du délai de grâce. Il peut être révoqué à tout moment ; l'obligation de cotiser demeure.`,
      `Avant le démarrage, un membre peut quitter le groupe : sa caution lui est rendue, et tous les membres devront signer à nouveau. Après le démarrage, personne ne peut quitter le groupe.`,
      `L'organisateur ne peut ni déplacer les fonds, ni modifier un solde, ni se verser de l'argent en dehors de ces règles. Seul le système exécute les versements.`,
      `Ces règles sont signées avec votre code PIN. Toute modification crée une nouvelle version, qui doit être signée à nouveau. Chaque opération reçoit une référence unique et reste visible dans l'historique du groupe.`
    )

    return clauses
  }

  /** Writes a new version and makes it the group's current one. */
  static async publish(
    likiliba: Likiliba,
    commissionBps: number,
    createdByUserId: number,
    trx: TransactionClientContract,
    extra: { roster?: RosterEntry[]; manualOrder?: number[] } = {}
  ): Promise<LikilibaRuleVersion> {
    const last = await LikilibaRuleVersion.query({ client: trx })
      .where('likilibaId', likiliba.id)
      .orderBy('version', 'desc')
      .first()

    const rules = {
      terms: this.terms(likiliba, commissionBps, extra),
      clauses: this.clauses(likiliba, commissionBps, extra.roster, extra.manualOrder),
    }

    const version = new LikilibaRuleVersion()
    version.likilibaId = likiliba.id
    version.version = (last?.version ?? 0) + 1
    version.rules = rules
    version.rulesHash = sha256(canonicalJson(rules))
    version.createdByUserId = createdByUserId
    await version.useTransaction(trx).save()

    likiliba.currentRuleVersionId = version.id
    await likiliba.useTransaction(trx).save()
    return version
  }

  static async current(likiliba: Likiliba, trx?: TransactionClientContract) {
    if (!likiliba.currentRuleVersionId) return null
    return LikilibaRuleVersion.find(likiliba.currentRuleVersionId, trx ? { client: trx } : {})
  }

  /** The commission rate the members agreed to, read back from their signed rules. */
  static commissionBpsOf(version: LikilibaRuleVersion): number {
    return Number(version.rules?.terms?.commission_bps ?? 0)
  }
}
