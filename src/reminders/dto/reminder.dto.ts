import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateReminderDto {
  @IsInt()
  patientId: number;

  @IsDateString()
  dateRappel: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateReminderDto {
  @IsOptional()
  @IsBoolean()
  termine?: boolean;

  @IsOptional()
  @IsDateString()
  dateRappel?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
