import { IsIn, IsOptional, IsString } from 'class-validator';

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
}
