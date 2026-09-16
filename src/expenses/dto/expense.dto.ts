import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @MaxLength(200)
  libelle: string;

  @IsNumber()
  @IsPositive()
  montant: number;

  @IsDateString()
  dateDepense: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  categorie?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fournisseur?: string;

  @IsOptional()
  @IsString()
  justificatif?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  montant?: number;

  @IsOptional()
  @IsDateString()
  dateDepense?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  categorie?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fournisseur?: string;

  @IsOptional()
  @IsString()
  justificatif?: string;
}
