import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export const TYPES_IMAGE_PATIENT = ['photo', 'radio', 'panoramique', 'scanner', 'document'] as const;
export type TypeImagePatient = (typeof TYPES_IMAGE_PATIENT)[number];

export class UploadPatientImageDto {
  @IsIn(TYPES_IMAGE_PATIENT)
  type: TypeImagePatient;

  @IsOptional()
  @IsString()
  titre?: string;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @IsString()
  datePrise?: string;

  // Consultation à laquelle rattacher le fichier (2026-10-16). Envoyé en
  // multipart, donc reçu comme texte : converti en nombre.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  treatmentId?: number;
}

// Rattacher (treatmentId) ou détacher (null) une pièce jointe existante.
export class LinkPatientImageDto {
  @IsOptional()
  @IsInt()
  treatmentId?: number | null;
}
