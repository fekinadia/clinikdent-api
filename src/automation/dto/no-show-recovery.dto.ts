import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export class UpdateNoShowRecoveryDto {
  @ApiProperty({
    enum: ['perdu'],
    description: "Seule transition manuelle autorisée : le cabinet abandonne la relance.",
  })
  @IsIn(['perdu'])
  statut: string;
}

/**
 * STEP 4 — marquer une relance no-show comme récupérée (le patient a repris
 * rendez-vous). Le lien vers le nouveau RDV est optionnel : le cabinet peut
 * marquer "récupéré" avant d'avoir créé le nouveau RDV dans l'agenda, ou par
 * simple suivi téléphonique sans RDV formel de reprise immédiat.
 */
export class MarkRecoveredDto {
  @ApiPropertyOptional({
    example: 18422,
    description:
      "ID du nouveau rendez-vous de reprise, si déjà créé dans l'agenda. Doit appartenir au même cabinet que la relance.",
  })
  @IsOptional()
  @IsInt()
  nouveauAppointmentId?: number;
}
