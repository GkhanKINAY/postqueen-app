import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class AdminRefundChargesDto {
  // The charges the admin screen lists, which reads at most 100.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  chargeIds: string[];
}
