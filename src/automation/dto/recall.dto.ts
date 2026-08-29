import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

const TYPES_RECALL_MOIS = [1, 3, 6, 12];

export class CreateRecallDto {
  @ApiProperty({ example: 18773 })
  @IsInt()
  @IsNotEmpty()
  patientId: number;

  @ApiPropertyOptional({
    enum: TYPES_RECALL_MOIS,
    description:
      "Délai standard en mois avant échéance. Fournir soit typeRecallMois, soit dateEcheance.",
  })
  @IsOptional()
  @IsIn(TYPES_RECALL_MOIS)
  typeRecallMois?: number;

  @ApiPropertyOptional({
    example: '2026-12-01T00:00:00.000Z',
    description: 'Échéance personnalisée, alternative à typeRecallMois.',
  })
  @IsOptional()
  @IsDateString()
  dateEcheance?: string;

  @ApiPropertyOptional({
    example: '2026-08-29T00:00:00.000Z',
    description: "Date de la dernière visite. Défaut : aujourd'hui.",
  })
  @IsOptional()
  @IsDateString()
  dateDerniereVisite?: string;
}

export class UpdateRecallDto {
  @ApiPropertyOptional({ enum: TYPES_RECALL_MOIS })
  @IsOptional()
  @IsIn(TYPES_RECALL_MOIS)
  typeRecallMois?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateEcheance?: string;

  @ApiPropertyOptional({ enum: ['annule'] })
  @IsOptional()
  @IsIn(['annule'])
  statut?: string;
}
