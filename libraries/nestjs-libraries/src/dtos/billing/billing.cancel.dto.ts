import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class BillingCancelDto {
  // true from the cancel flow, false from "Reactivate". A page loaded before
  // the intent was sent has neither, and the request toggles as it did.
  @IsOptional()
  @IsBoolean()
  cancel?: boolean;

  // Why they are leaving, for the team's "Cancelled" email.
  @IsOptional()
  @IsString()
  feedback?: string;
}
