import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { AppService } from './app.service';
import { Membership } from './memberships/entities/membership.entity';
import { PdgaTournamentData } from './dtos/pdga-tournament-data';
import { BcdsTournamentMembershipReport } from './dtos/membership-status-report';
import { MembershipState } from './dtos/membership-state';

@UseInterceptors(ClassSerializerInterceptor)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('test')
  async importBcdsMembershipGoogleDoc(): Promise<string> {
    return await this.appService.importBcdsMembershipGoogleDoc();
  }

  @Get('get-memberships')
  async getMembership(@Query() query): Promise<Membership[]> {
    await this.appService.importBcdsMembershipGoogleDoc();
    return await this.appService.getMemberships(
      query.firstName,
      query.lastName,
      query.pdgaNumber,
    );
  }

  @Get('check-membership')
  async checkMembership(@Query() query): Promise<MembershipState> {
    await this.appService.importBcdsMembershipGoogleDoc();
    return await this.appService.checkMembership(
      query.firstName,
      query.lastName,
      query.pdgaNumber,
      query.date,
    );
  }

  @Get('check-tournament')
  async checkTournament(
    @Query() query,
  ): Promise<BcdsTournamentMembershipReport> {
    await this.appService.importBcdsMembershipGoogleDoc();
    return await this.appService.checkTournament(query.tournamentId);
  }

  @Get('get-tournament-data')
  async getTournamentData(@Query() query): Promise<PdgaTournamentData> {
    return await this.appService.getTournamentData(query.tournamentId);
  }
}
