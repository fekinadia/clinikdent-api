import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreatePatientDto {
  @ApiProperty({ example: 'Zouabia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nom: string;

  @ApiProperty({ example: 'Raouda' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  prenom: string;

  @ApiPropertyOptional({ example: '1986-03-30' })
  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @ApiPropertyOptional({ enum: ['M', 'F'] })
  @IsOptional()
  @IsIn(['M', 'F'])
  sexe?: string;

  @ApiPropertyOptional({ example: '22000800' })
  @IsOptional()
  @IsString()
  gsm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adresse?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ville?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assurance?: string;

  @ApiPropertyOptional({ example: 'Allergie pénicilline. Grossesse en cours.' })
  @IsOptional()
  @IsString()
  antecedents?: string;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}

export class ListPatientsQueryDto {
  @ApiPropertyOptional({ description: 'Recherche par nom, prénom, GSM' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}
