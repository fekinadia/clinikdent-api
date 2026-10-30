import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DUREES_CRENEAU } from '../creneaux';

export class CreneauxQueryDto {
  @ApiProperty({ example: '2026-11-02' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;
}

export class CreerDemandeDto {
  @ApiProperty({ example: 'Amira' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  prenom: string;

  @ApiProperty({ example: 'Ben Ali' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nom: string;

  @ApiProperty({ example: '22 000 800' })
  @IsString()
  @Matches(/^\+?[\d\s.()-]{8,25}$/, { message: 'Numéro de téléphone invalide' })
  gsm: string;

  @ApiPropertyOptional({ example: 'Douleur dentaire' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motif?: string;

  @ApiProperty({ example: '2026-11-02' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiProperty({ example: '09:30' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  heure: string;

  @ApiPropertyOptional({ enum: ['fr', 'ar'] })
  @IsOptional()
  @IsIn(['fr', 'ar'])
  langue?: string;

  // Champ invisible pour un humain : seul un robot le remplit.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteWeb?: string;
}

export class ConfirmerDemandeDto {
  @ApiPropertyOptional({ description: 'Dossier existant ; laissé vide, un nouveau dossier est créé.' })
  @IsOptional()
  @IsInt()
  patientId?: number;
}

export class ReglagesReservationDto {
  @ApiProperty()
  @IsBoolean()
  active: boolean;

  @ApiProperty({ example: 'cabinet-ben-salem' })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "L'adresse ne peut contenir que des lettres sans accent, des chiffres et des tirets",
  })
  slug: string;

  @ApiProperty({ example: { '1': [{ debut: '09:00', fin: '13:00' }] } })
  @IsObject()
  horaires: Record<string, unknown>;

  @ApiProperty({ enum: DUREES_CRENEAU })
  @IsIn(DUREES_CRENEAU)
  dureeCreneau: number;
}
