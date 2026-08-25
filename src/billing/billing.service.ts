import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS, PlanKey, isValidPlan } from './plan-limits';

const KONNECT_BASE_URL = 'https://api.konnect.network/api/v2';

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async getStatus(cabinetId: number) {
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: cabinetId },
    });
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');

    const [nbPatients, nbPraticiens] = await Promise.all([
      this.prisma.patient.count({ where: { cabinetId } }),
      this.prisma.user.count({ where: { cabinetId, role: 'medecin' } }),
    ]);

    const planKey: PlanKey = isValidPlan(cabinet.plan)
      ? cabinet.plan
      : 'starter';
    const limites = PLAN_LIMITS[planKey];

    const now = new Date();
    const essaiExpire =
      cabinet.subscriptionStatus === 'trial' &&
      !!cabinet.trialEndsAt &&
      cabinet.trialEndsAt < now;
    const abonnementExpire =
      cabinet.subscriptionStatus === 'active' &&
      !!cabinet.subscriptionEndsAt &&
      cabinet.subscriptionEndsAt < now;

    return {
      plan: planKey,
      label: limites.label,
      statut: cabinet.subscriptionStatus,
      trialEndsAt: cabinet.trialEndsAt,
      subscriptionEndsAt: cabinet.subscriptionEndsAt,
      accesBloque: essaiExpire || abonnementExpire,
      usage: {
        patients: { utilises: nbPatients, max: limites.maxPatients },
        praticiens: { utilises: nbPraticiens, max: limites.maxPraticiens },
      },
      plansDisponibles: PLAN_LIMITS,
    };
  }

  async createCheckout(cabinetId: number, plan: PlanKey) {
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: cabinetId },
    });
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');

    const limites = PLAN_LIMITS[plan];
    const apiKey = this.config.get<string>('KONNECT_API_KEY');
    const walletId = this.config.get<string>('KONNECT_WALLET_ID');
    const baseUrl = this.config.get<string>('APP_BASE_URL');

    if (!apiKey || !walletId) {
      throw new BadRequestException(
        "Le paiement en ligne n'est pas encore configuré (Konnect)",
      );
    }

    const orderId = `cabinet-${cabinetId}-${plan}-${Date.now()}`;

    // On garde une trace du paiement dès l'initiation, avant même la
    // confirmation Konnect (statut "pending" par défaut).
    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        cabinetId,
        montant: limites.prixMillimes / 1000,
        plan,
        statut: 'pending',
        provider: 'konnect',
      },
    });

    const res = await fetch(`${KONNECT_BASE_URL}/payments/init-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        receiverWalletId: walletId,
        amount: limites.prixMillimes,
        token: 'TND',
        type: 'immediate',
        description: `Abonnement ClinikDent - Plan ${limites.label}`,
        orderId,
        webhook: baseUrl ? `${baseUrl}/billing/webhook` : undefined,
        successUrl: baseUrl
          ? `${baseUrl}/parametres/abonnement?statut=succes`
          : undefined,
        failUrl: baseUrl
          ? `${baseUrl}/parametres/abonnement?statut=echec`
          : undefined,
      }),
    });

    if (!res.ok) {
      throw new BadRequestException(
        'Erreur lors de la création du paiement (Konnect)',
      );
    }

    const data = (await res.json()) as { payUrl: string; paymentRef: string };

    await this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { paymentRef: data.paymentRef },
    });

    return { payUrl: data.payUrl, paymentRef: data.paymentRef };
  }

  /**
   * Konnect appelle cette route en GET après un paiement (webhook), en
   * ajoutant l'identifiant du paiement en query string. Par prudence on ne
   * fait jamais confiance à un statut transmis dans l'appel lui-même : on
   * re-demande le statut réel à l'API Konnect avant de valider quoi que ce
   * soit (recommandation officielle Konnect : se fier au statut du paiement,
   * pas au statut de la transaction).
   */
  async handleWebhook(paymentId?: string) {
    if (!paymentId) return { ok: false };

    const apiKey = this.config.get<string>('KONNECT_API_KEY');
    if (!apiKey) return { ok: false };

    const res = await fetch(`${KONNECT_BASE_URL}/payments/${paymentId}`, {
      headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) return { ok: false };

    const data = (await res.json()) as {
      payment?: { id?: string; status?: string };
    };
    const paymentRef = data.payment?.id || paymentId;
    const statutKonnect = data.payment?.status;

    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { paymentRef },
    });
    if (!payment) return { ok: false };

    if (statutKonnect === 'completed' && payment.statut !== 'completed') {
      const periodeDebut = new Date();
      const periodeFin = new Date(periodeDebut);
      periodeFin.setMonth(periodeFin.getMonth() + 1);

      await this.prisma.$transaction([
        this.prisma.subscriptionPayment.update({
          where: { id: payment.id },
          data: { statut: 'completed', periodeDebut, periodeFin },
        }),
        this.prisma.cabinet.update({
          where: { id: payment.cabinetId },
          data: {
            plan: payment.plan,
            subscriptionStatus: 'active',
            subscriptionEndsAt: periodeFin,
          },
        }),
      ]);
    }

    return { ok: true };
  }
}
