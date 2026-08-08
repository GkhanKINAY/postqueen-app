import {
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class IntegrationValidateTimeDto {
  @IsDefined()
  @IsNumber()
  time: number;
}
export class IntegrationTimeDto {
  @Type(() => IntegrationValidateTimeDto)
  @IsArray()
  // An enabled channel with zero posting times contributes no slots, which used
  // to make findFreeDateTime walk forward forever.
  @ArrayNotEmpty()
  @IsDefined()
  @ValidateNested({ each: true })
  time: IntegrationValidateTimeDto[];
}
