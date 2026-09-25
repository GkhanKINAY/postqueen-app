import { IsBoolean } from 'class-validator';

export class ProductNewsDto {
  @IsBoolean()
  subscribed: boolean;
}
