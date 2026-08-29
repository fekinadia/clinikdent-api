import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ example: 18773 })
  @IsInt()
  @IsNotEmpty()
  patientId: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  medecinId?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  typeId?: number;

  @ApiProperty({ example: '2026-04-23T10:00:00.000Z' })
  @IsDateString()
  dateDebut: string;

  @ApiProperty({ example: '2026-04-23T10:30:00.000Z' })
  @IsDateString()
  dateFin: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observation?: string;
}

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {
  @ApiPropertyOptional({
    enum: ['planifie', 'confirme', 'en_cours', 'termine', 'annule', 'absent', 'a_reprogrammer', 'no_show'],
  })
  @IsOptional()
  @IsIn(['planifie', 'confirme', 'en_cours', 'termine', 'annule', 'absent', 'a_reprogrammer', 'no_show'])
  statut?: string;
}

export class ListAppointmentsQueryDto {
  @ApiPropertyOptional({ description: 'Date début (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @ApiPropertyOptional({ description: 'Date fin (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  patientId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  medecinId?: number;
}
