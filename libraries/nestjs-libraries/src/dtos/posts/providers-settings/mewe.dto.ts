import { IsIn, IsString, MinLength, ValidateIf } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class MeweDto {
  @IsIn(['timeline', 'group'])
  @JSONSchema({
    description: 'Where to post: timeline or group',
  })
  postType: 'timeline' | 'group';

  // Required for a group post: MeWe has nowhere to put a group post
  // without one. @IsOptional used to skip this whenever the group was left
  // out, so such a post was scheduled and then refused.
  @ValidateIf((o) => o.postType === 'group')
  @MinLength(1, { message: 'Select a group to post to' })
  @IsString({ message: 'Select a group to post to' })
  @JSONSchema({
    description: 'Group must be an id',
  })
  group?: string;
}
