import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateAutomationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rappelsActifs?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noShowActif?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  recallActif?: boolean;

  @ApiPropertyOptional({ type: [Number], example: [48, 24] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  rappelOffsetsHeures?: number[];

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 720,
    default: 24,
    description:
      "Délai (en heures) après la fin du rendez-vous avant classification automatique en no-show. Doit être strictement positif (0 ou négatif rejetés) ; plafonné à 720h (30 jours) pour éviter une valeur aberrante qui bloquerait indéfiniment la détection.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  delaiNoShowHeures?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  recallDefautMois?: number;
}
