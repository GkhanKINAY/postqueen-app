import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { AutopostDto } from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { OnlyURL } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';

@ApiTags('Autopost')
@Controller('/autopost')
export class AutopostController {
  constructor(private _autopostsService: AutopostService) {}

  @Get('/')
  async getAutoposts(@GetOrgFromRequest() org: Organization) {
    return this._autopostsService.getAutoposts(org.id);
  }

  // Was Sections.WEBHOOKS, which counts webhook rows. It got the answer wrong
  // in both directions: an org that had used up its webhook quota could not
  // create an autopost for a reason that has nothing to do with autopost, and
  // an org whose tier said no autopost could create them until it reached two
  // webhooks. The pricing flag was read nowhere.
  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.AUTOPOST])
  async createAutopost(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AutopostDto
  ) {
    return this._autopostsService.createAutopost(org.id, body);
  }

  @Put('/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.AUTOPOST])
  async updateAutopost(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AutopostDto,
    @Param('id') id: string
  ) {
    return this._autopostsService.updateAutopost(org.id, body, id);
  }

  @Delete('/:id')
  async deleteAutopost(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._autopostsService.deleteAutopost(org.id, id);
  }

  // Deliberately unguarded. Switching a rule *off* must not require a
  // subscription, and switching one on needs a rule that already exists —
  // which, now that every paid tier has autoPost, only a paid tier could have
  // created. An org that lapsed to FREE has had its running workflows
  // terminated by changeActiveCron already and cannot reach Settings at all.
  @Post('/:id/active')
  async changeActive(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('active') active: boolean
  ) {
    return this._autopostsService.changeActive(org.id, id, active);
  }

  @Post('/send')
  async sendWebhook(@Query() query: OnlyURL) {
    return this._autopostsService.loadXML(query.url);
  }
}
