import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  medicationId?: number;

  @ApiProperty({ example: 'DOLIPRANE 1G COMP' })
  @IsString()
  @IsNotEmpty()
  nomMedicament: string;

  @ApiProperty({ example: '1cp x3/j pdt 03 jours' })
  @IsString()
  posologie: string;
}

export class CreatePrescriptionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  patientId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateEmission?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  texteLibre?: string;

  @ApiProperty({ type: [PrescriptionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
