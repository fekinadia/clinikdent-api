import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  medicationId?: number;

  @ApiProperty({ example: 'DOLIPRANE 1G COMP' })
  @IsString()
  @IsNotEmpty()
  nomMedicament: string;

  @ApiProperty({ example: '1cp x3/j pdt 03 jours' })
  @IsString()
  posologie: string;
}

export class CreatePrescriptionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  patientId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateEmission?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  texteLibre?: string;

  @ApiProperty({ type: [PrescriptionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}

export class CreatePrescriptionModeleDto {
  @ApiProperty({ example: 'Détartrage standard' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiProperty({ example: 'Bain de bouche antiseptique...' })
  @IsString()
  @IsNotEmpty()
  contenu: string;
}

// Catalogue de médicaments (page "Médicaments", 2026-10-02). Depuis le
// 2026-10-16 : catalogue commun en lecture seule (cabinetId null) + médicaments
// propres à chaque cabinet — le cabinetId vient toujours du jeton, jamais du
// corps de la requête (aucun champ cabinetId ici).
export class CreateMedicationDto {
  @ApiProperty({ example: 'Doliprane 1G B/8' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiPropertyOptional({ example: '1000 CP' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ example: 'Comprimés' })
  @IsOptional()
  @IsString()
  forme?: string;

  @ApiPropertyOptional({ example: '1000 CP / 3*1' })
  @IsOptional()
  @IsString()
  posologieDefaut?: string;
}

export class UpdateMedicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  forme?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  posologieDefaut?: string;
}
