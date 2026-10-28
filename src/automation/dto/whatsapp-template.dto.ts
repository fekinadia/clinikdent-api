import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

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
}

export class UpdateWhatsAppTemplateDto extends PartialType(CreateWhatsAppTemplateDto) {}
