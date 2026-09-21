import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Les ordonnances restent gérées par le module Prescriptions (table
// `prescriptions`) : ce module ne couvre que les 4 autres types de
// documents générés depuis la fiche patient.
export const DOCUMENT_TYPES = [
  'certificat_medical',
  'lettre_liaison',
  'devis',
  'note_honoraires',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export class CreateDocumentDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  patientId: number;

  @ApiProperty({ enum: DOCUMENT_TYPES, example: 'certificat_medical' })
  @IsIn(DOCUMENT_TYPES)
  type: DocumentType;

  @ApiProperty({ example: 'Je soussigné(e) Dr ..., certifie que...' })
  @IsString()
  @IsNotEmpty()
  contenu: string;

  @ApiPropertyOptional({ example: 250, description: 'Montant en DT (Devis / Note d\'honoraires)' })
  @IsOptional()
  @IsNumber()
  montant?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateEmission?: string;
}

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ enum: DOCUMENT_TYPES })
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  type?: DocumentType;

  @ApiPropertyOptional({ description: 'Recherche par nom / prénom du patient' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}
