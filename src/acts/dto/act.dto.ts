import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateActDto {
  @ApiProperty({ example: 'Détartrage' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  libelle: string;

  @ApiPropertyOptional({ example: 'prevention' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  categorie?: string;

  @ApiPropertyOptional({ example: 'Nettoyage et polissage des dents' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 90, description: 'Tarif par défaut (DT)' })
  @IsNumber()
  @Min(0)
  tarifBase: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  dureeMinutes?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class UpdateActDto extends PartialType(CreateActDto) {}
