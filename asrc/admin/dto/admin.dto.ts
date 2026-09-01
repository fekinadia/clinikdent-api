import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
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
}
