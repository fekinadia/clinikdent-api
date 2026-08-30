import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { RemindersSchedulerService } from './reminders-scheduler.service';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [SmsModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersSchedulerService],
})
export class RemindersModule {}
