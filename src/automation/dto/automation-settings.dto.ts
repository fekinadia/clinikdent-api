import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  delaiNoShowHeures?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  recallDefautMois?: number;
}
