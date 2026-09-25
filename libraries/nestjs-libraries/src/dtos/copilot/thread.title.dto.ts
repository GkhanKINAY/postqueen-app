import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** A new name for a Copilot chat, set from the Chats list. */
export class ThreadTitleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;
}
