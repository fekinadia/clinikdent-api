import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWhatsAppTemplateDto {
  @ApiProperty({ enum: ['reminder', 'recall', 'no_show'] })
  @IsIn(['reminder', 'recall', 'no_show'])
  type: string;

  @ApiProperty({ example: 'Rappel RDV 48h' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiProperty({
    example:
      'Bonjour {{prenom}} {{nom}}, rappel de votre RDV le {{date}} à {{heure}} avec {{dentiste}} chez {{cabinet}}.',
  })
  @IsString()
  @IsNotEmpty()
  contenu: string;

  @ApiPropertyOptional({ enum: ['fr', 'ar'], description: 'Langue du modèle (français par défaut)' })
  @IsOptional()
  @IsIn(['fr', 'ar'])
  langue?: string;
}

export class UpdateWhatsAppTemplateDto extends PartialType(CreateWhatsAppTemplateDto) {}
