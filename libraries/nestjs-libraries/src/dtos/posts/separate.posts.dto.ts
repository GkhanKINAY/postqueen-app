import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * A post to split into a thread. Bounded because separating it is charged a
 * fixed price: the model reads all of it, and every part over `len` costs up
 * to four more calls to shorten.
 */
export class SeparatePostsDto {
  @IsString()
  @MaxLength(20000)
  content: string;

  // The channel's character limit: 300 on Bluesky, 280 to 25,000 on X.
  @IsInt()
  @Min(100)
  @Max(25000)
  len: number;
}
