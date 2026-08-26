import { Module } from '@nestjs/common';
import { PatientImagesController } from './patient-images.controller';
import { PatientImagesService } from './patient-images.service';

@Module({
  controllers: [PatientImagesController],
  providers: [PatientImagesService],
})
export class PatientImagesModule {}
