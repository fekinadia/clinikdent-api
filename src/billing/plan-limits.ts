export const TRIAL_DAYS = 14;

export const DEMO_DURATION_HOURS = 24;

export type PlanKey = 'starter' | 'pro' | 'premium';

export interface PlanDefinition {
  label: string;
  /** Prix mensuel en millimes (1 DT = 1000 millimes), pour l'API Konnect. */
  prixMillimes: number;
  /** null = illimité */
  maxPatients: number | null;
  maxPraticiens: number | null;
}

export const PLAN_LIMITS: Record<PlanKey, PlanDefinition> = {
  starter: {
    label: 'Starter',
    prixMillimes: 59000,
    maxPatients: 500,
    maxPraticiens: 1,
  },
  pro: {
    label: 'Pro',
    prixMillimes: 99000,
    maxPatients: 2000,
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
