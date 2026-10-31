import { Prisma } from '@prisma/client';

/**
 * Un prospect reste hors de la liste Patients et des compteurs tant qu'il n'est
 * pas venu au cabinet. Un soin ou un paiement prouve le contraire, même si le
 * passage par « Arrivé » a été oublié : cette fiche reste alors visible.
 */
export const PATIENT_VISIBLE: Prisma.PatientWhereInput = {
  OR: [{ estProspect: false }, { treatments: { some: {} } }, { payments: { some: {} } }],
};
