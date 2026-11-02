import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreerEssaiDto {
  @ApiProperty({ example: 'Nour' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  prenom: string;

  @ApiProperty({ example: 'Haddad' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nom: string;

  @ApiProperty({ example: 'Cabinet Dentaire Les Jasmins' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nomCabinet: string;

  @ApiProperty({ example: '22 000 800' })
  @IsString()
  @Matches(/^\+?[\d\s.()-]{8,25}$/, { message: 'Numéro de téléphone invalide' })
  gsm: string;

  // Champ invisible pour un humain : seul un robot le remplit.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteWeb?: string;
}
