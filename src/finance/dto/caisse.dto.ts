import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

export class CaisseQueryDto {
  @ApiPropertyOptional({ example: '2026-09-27', description: "Jour (YYYY-MM-DD), aujourd'hui par défaut" })
  @IsOptional()
  @Matches(JOUR, { message: 'date doit être au format YYYY-MM-DD' })
  date?: string;
}

export class ChequesQueryDto {
  @ApiPropertyOptional({ enum: ['en_attente', 'encaisse', 'tous'] })
  @IsOptional()
  @IsIn(['en_attente', 'encaisse', 'tous'])
  statut?: 'en_attente' | 'encaisse' | 'tous';
}

export class SetChequeEncaisseDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  encaisse: boolean;

  @ApiPropertyOptional({ example: '2026-09-27', description: "Date d'encaissement, aujourd'hui par défaut" })
  @IsOptional()
  @Matches(JOUR, { message: 'dateEncaissement doit être au format YYYY-MM-DD' })
  dateEncaissement?: string;
}
