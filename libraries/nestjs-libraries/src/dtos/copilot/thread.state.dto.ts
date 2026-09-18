import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { CopilotSurface } from '@gitroom/helpers/utils/copilot.context';

/**
 * The per-thread UI state a Copilot surface keeps beside the transcript:
 * which channels were selected and what happened to each Post Preview card.
 * Merged into the thread's metadata, so every field is optional.
 */
export class ThreadStateDto {
  @IsOptional()
  @IsIn(['agent', 'composer'])
  surface?: CopilotSurface;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  channels?: string[];

  @IsOptional()
  @IsObject()
  cards?: Record<string, unknown>;
}
