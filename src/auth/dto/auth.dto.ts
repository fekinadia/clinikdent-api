import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'docteur@clinikdent.tn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'motdepasse123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'docteur@clinikdent.tn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'motdepasse123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Ben Salah' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiProperty({ example: 'Mohamed' })
  @IsString()
  @IsNotEmpty()
  prenom: string;

  @ApiProperty({ example: 'Cabinet Dentaire Sfax' })
  @IsString()
  @IsNotEmpty()
  nomCabinet: string;
}

// Volet "changer mon mot de passe" (2026-09-21) — self-service pour un
// utilisateur déjà connecté. Distinct d'un futur "mot de passe oublié"
// (qui nécessitera un envoi d'email, non encore mis en place).
export class ChangePasswordDto {
  @ApiProperty({ example: 'ancienMotDePasse123' })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty({ example: 'nouveauMotDePasse456' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
