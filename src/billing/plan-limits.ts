export const TRIAL_DAYS = 30;

export const DEMO_DURATION_HOURS = 24;

export const ESSAI_TERMINE =
  "Votre période d'essai est terminée. Contactez-nous pour continuer.";

export function essaiTermine(
  cabinet?: { estDemo: boolean; demoExpiresAt: Date | null } | null,
): boolean {
  return !!(cabinet?.estDemo && cabinet.demoExpiresAt && cabinet.demoExpiresAt < new Date());
}

export type PlanKey = 'starter' | 'pro' | 'premium';

export interface PlanDefinition {
  label: string;
  /** Prix mensuel en millimes (1 DT = 1000 millimes), pour l'API Konnect. */
  prixMillimes: number;
  /** null = illimité */
  maxPatients: number | null;
  maxPraticiens: number | null;
}

// Prix choisi le 2026-11-06 : 90 DT par mois, patients illimités. Les formules
// se distinguent par le nombre de dentistes ; pro et premium restent à fixer.
export const PLAN_LIMITS: Record<PlanKey, PlanDefinition> = {
  starter: {
    label: 'Starter',
    prixMillimes: 90000,
    maxPatients: null,
    maxPraticiens: 1,
  },
  pro: {
    label: 'Pro',
    prixMillimes: 99000,
    maxPatients: null,
    maxPraticiens: 2,
  },
  premium: {
    label: 'Premium',
    prixMillimes: 179000,
    maxPatients: null,
    maxPraticiens: null,
  },
};

export function isValidPlan(plan: string): plan is PlanKey {
  return plan === 'starter' || plan === 'pro' || plan === 'premium';
}
