import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import {
  discardTempFile,
  spooledFileInterceptor,
} from '@gitroom/nestjs-libraries/upload/uploaded.file';

// The MCP upload widget's own routes. UploadWidgetAuthMiddleware has already
// turned the ticket into the organization and upload session before the
// interceptor spools anything to disk.
@ApiTags('Media')
@Controller('/media-widget')
export class MediaWidgetController {
  private storage = UploadFactory.createStorage();
  constructor(private _mediaService: MediaService) {}

  @Post('/upload')
  @UseInterceptors(spooledFileInterceptor())
  @UsePipes(new CustomFileValidationPipe())
  async upload(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    try {
      const uploadedFile = await this.storage.uploadFile(file);
      return await this._mediaService.saveUploadSessionFile(
        org.id,
        // @ts-ignore
        req.uploadSession,
        uploadedFile.originalname,
        uploadedFile.path,
        file.originalname,
        file.size
      );
    } finally {
      await discardTempFile(file);
    }
  }

  @Get('/status')
  status(@GetOrgFromRequest() org: Organization, @Req() req: Request) {
    // @ts-ignore
    return this._mediaService.getUploadSession(org.id, req.uploadSession);
  }
}
