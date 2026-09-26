import { ArrayMaxSize, IsArray, IsIn } from 'class-validator';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';

/** What the composer asks to have priced while a post is written. */
export class PublishCreditsDto {
  @IsIn(['draft', 'schedule', 'now', 'update'])
  type: CreatePostDto['type'];

  // The channels as the composer sends them to /posts/valid. Only priced
  // here, never saved, so they are read, not validated as a post.
  @IsArray()
  @ArrayMaxSize(100)
  posts: CreatePostDto['posts'];
}
