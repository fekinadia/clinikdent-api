import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateNoShowRecoveryDto {
  @ApiProperty({
    enum: ['perdu'],
    description: "Seule transition manuelle autorisée : le cabinet abandonne la relance.",
  })
  @IsIn(['perdu'])
  statut: string;
}
