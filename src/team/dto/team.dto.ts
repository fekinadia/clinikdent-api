import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Role } from '../../auth/roles.decorator';

const INVITABLE_ROLES: Role[] = ['admin', 'medecin', 'assistante', 'reception', 'comptable'];

export class InviteMemberDto {
  @ApiProperty({ example: 'Ben Salah' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiProperty({ example: 'Sonia' })
  @IsString()
  @IsNotEmpty()
  prenom: string;

  @ApiProperty({ example: 'sonia@cabinet-exemple.tn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'assistante', enum: INVITABLE_ROLES })
  @IsIn(INVITABLE_ROLES)
  role: Role;
}

export class UpdateMemberDto {
  @ApiProperty({ example: 'reception', enum: INVITABLE_ROLES, required: false })
  @IsOptional()
  @IsIn(INVITABLE_ROLES)
  role?: Role;

  @ApiProperty({ example: false, required: false, description: 'Désactiver (false) ou réactiver (true) le membre' })
  @IsOptional()
  actif?: boolean;
}
