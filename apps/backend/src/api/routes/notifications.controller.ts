import {
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Notifications')
@Controller('/notifications')
export class NotificationsController {
  constructor(private _notificationsService: NotificationService) {}
  @Get('/')
  async mainPageList(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization
  ) {
    return this._notificationsService.getMainPageCount(
      organization.id,
      user.id
    );
  }

  @Get('/list')
  async notifications(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization
  ) {
    return this._notificationsService.getNotifications(
      organization.id,
      user.id
    );
  }

  /** Advances lastReadNotifications — used by Mark all read (and open-to-clear badge). */
  @Post('/read')
  async markAllRead(@GetUserFromRequest() user: User) {
    return this._notificationsService.markAllAsRead(user.id);
  }
}
