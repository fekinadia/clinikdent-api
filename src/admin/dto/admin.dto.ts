import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDemoAccountDto {
  @ApiProperty({ example: 'Cabinet Démo Sfax' })
  @IsString()
  @IsNotEmpty()
  nomCabinet: string;

  @ApiProperty({ example: 'Ben Salah' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiProperty({ example: 'Mohamed' })
  @IsString()
  @IsNotEmpty()
  prenom: string;

  @ApiProperty({ example: 'prospect@exemple.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'demo',
    enum: ['demo', 'permanent'],
    required: false,
    description:
      "Type de compte : 'demo' (24h, prospect) ou 'permanent' (client, essai 14 jours). Par défaut : demo.",
  })
  @IsOptional()
  @IsIn(['demo', 'permanent'])
  type?: 'demo' | 'permanent';
}
