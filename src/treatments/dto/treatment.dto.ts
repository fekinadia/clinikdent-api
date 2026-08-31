import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TreatmentActDto {
  @ApiPropertyOptional({ description: 'ID acte du catalogue' })
  @IsOptional()
  @IsInt()
  acteId?: number;

  @ApiProperty({ example: 'Détartrage' })
  @IsString()
  @IsNotEmpty()
  libelle: string;

  @ApiPropertyOptional({ example: '11;12;13', description: 'Dents séparées par ;' })
  @IsOptional()
  @IsString()
  dents?: string;

  @ApiProperty({ example: 90 })
  @IsNumber()
  cout: number;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsNumber()
  montantRecu?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  remise?: number;

  @ApiPropertyOptional({ enum: ['especes', 'cheque', 'cb', 'virement'] })
  @IsOptional()
  @IsIn(['especes', 'cheque', 'cb', 'virement'])
  modeReglement?: string;

  @ApiPropertyOptional({ enum: ['realise', 'a_faire', 'devis'], default: 'realise' })
  @IsOptional()
  @IsIn(['realise', 'a_faire', 'devis'])
  typeSoin?: string;
}

export class CreateTreatmentDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsNotEmpty()
  patientId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  appointmentId?: number;

  @ApiProperty({ example: '2026-04-23' })
  @IsDateString()
  dateSoin: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;

  @ApiProperty({ type: [TreatmentActDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TreatmentActDto)
  acts: TreatmentActDto[];
}

export class UpdateTreatmentActDto {
  @ApiProperty({ description: "ID de l'acte à modifier (doit appartenir à la séance)" })
  @IsInt()
  id: number;

  @ApiProperty({ example: 'Détartrage' })
  @IsString()
  @IsNotEmpty()
  libelle: string;

  @ApiPropertyOptional({ example: '11;12;13', description: 'Dents séparées par ;' })
  @IsOptional()
  @IsString()
  dents?: string;
}

export class UpdateTreatmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateSoin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;

  @ApiPropertyOptional({ type: [UpdateTreatmentActDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateTreatmentActDto)
  acts?: UpdateTreatmentActDto[];
}

export class UpdateToothStateDto {
  @ApiProperty({ example: 11, description: 'Numéro de dent FDI' })
  @IsInt()
  dentNumero: number;

  @ApiProperty({
    enum: ['saine', 'carie', 'obturation', 'couronne', 'bridge', 'implant',
      'extraction', 'absente', 'endo', 'a_traiter'],
  })
  @IsIn([
    'saine', 'carie', 'obturation', 'couronne', 'bridge', 'implant',
    'extraction', 'absente', 'endo', 'a_traiter',
  ])
  etat: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordPaymentDto {
  @ApiProperty({ example: 40, description: 'Montant encaissé (DT)' })
  @IsNumber()
  @IsPositive()
  montant: number;

  @ApiPropertyOptional({ enum: ['especes', 'cheque', 'd17', 'virement', 'cnam'] })
  @IsOptional()
  @IsIn(['especes', 'cheque', 'd17', 'virement', 'cnam'])
  modeReglement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarque?: string;
}
