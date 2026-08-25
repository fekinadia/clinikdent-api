import { IsIn } from 'class-validator';

export class CheckoutDto {
  @IsIn(['starter', 'pro', 'premium'])
  plan: 'starter' | 'pro' | 'premium';
}
