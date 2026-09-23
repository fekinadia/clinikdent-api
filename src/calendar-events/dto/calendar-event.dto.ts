import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateCalendarEventDto {
  @ApiProperty({ example: 'Pause déjeuner' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titre: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  medecinId?: number;

  @ApiProperty({ example: '2026-04-23T12:00:00.000Z' })
  @IsDateString()
  dateDebut: string;

  @ApiProperty({ example: '2026-04-23T13:00:00.000Z' })
  @IsDateString()
  dateFin: string;
}

export class UpdateCalendarEventDto extends PartialType(CreateCalendarEventDto) {}

export class ListCalendarEventsQueryDto {
  @ApiPropertyOptional({ description: 'Date début (ISO)' })
  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @ApiPropertyOptional({ description: 'Date fin (ISO)' })
  @IsOptional()
  @IsDateString()
  dateFin?: string;
}
