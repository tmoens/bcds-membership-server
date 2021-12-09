import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayersService } from './players/players.service';
import { PaymentService } from './payment/payment.service';
import { Payment } from './payment/entities/payment.entity';
import { Membership } from './memberships/entities/membership.entity';
import { MembershipsService } from './memberships/memberships.service';
import { getLogger } from 'log4js';
import { JobState, JobStats } from './helpers/jobstats';
import { pdgaNumberFromString } from './helpers/miscellaneous';
import { Player } from './players/entities/player.entity';
import {
  BcdsTournamentMembershipReport,
  BdcsMemberMini,
} from './dtos/membership-status-report';
import { PdgaApiService, PdgaPlayerMini } from './pdga-api/pdga-api.service';
import { PdgaTournamentData } from './dtos/pdga-tournament-data';
import { ImportDto } from './membership-sheet/importDtos';
import { MembershipSheetService } from './membership-sheet/membership-sheet.service';
import { plainToClass } from 'class-transformer';
import { MembershipState } from './dtos/membership-state';

const logger = getLogger('appService');

@Injectable()
export class AppService {
  constructor(
    private configService: ConfigService,
    private playerService: PlayersService,
    private membershipService: MembershipsService,
    private paymentService: PaymentService,
    private pdgaApiService: PdgaApiService,
    private membershipSheetService: MembershipSheetService,
  ) {}

  async getTournamentData(tournamentId: string): Promise<PdgaTournamentData> {
    return this.pdgaApiService.getTournamentData(tournamentId);
  }

  // Check to see which players in a pdga tournament are BCDS members
  // on the day of the tournament.
  async checkTournament(
    tournamentId: string,
  ): Promise<BcdsTournamentMembershipReport | null> {
    const report: BcdsTournamentMembershipReport =
      new BcdsTournamentMembershipReport();
    report.tournamentData = await this.pdgaApiService.getTournamentData(
      tournamentId,
    );
    // if there is no such tournament, we are done here.
    if (report.tournamentData) {
      return null;
    }

    const tournamentPlayers: PdgaPlayerMini[] =
      await this.pdgaApiService.getTournamentPlayers(tournamentId);

    for (const tp of tournamentPlayers) {
      const member: BdcsMemberMini = new BdcsMemberMini();
      member.name = tp.name;
      member.pdgaNumber = tp.pdgaNumber;

      const player = await this.playerService.findPlayer(
        tp.name,
        tp.pdgaNumber,
      );

      // If we found the player, check if the player has a membership
      member.state = await this.membershipService.isPlayerActive(
        player,
        report.tournamentData.start_date,
      );
      report.players.push(member);
    }
    return report;
  }

  // Fetch the membership BCDS history for a player.
  async getMemberships(
    firstName: string,
    lastName: string,
    pdgaNumberAsString: string,
  ): Promise<Membership[]> {
    const player = await this.findPlayer(
      firstName,
      lastName,
      pdgaNumberAsString,
    );

    if (player) {
      return await this.membershipService.getMemberships(player.id);
    } else {
      return [];
    }
  }

  async checkMembership(
    firstName: string,
    lastName: string,
    pdgaNumberAsString: string,
    tournamentDate: string,
  ): Promise<MembershipState> {
    const player = await this.findPlayer(
      firstName,
      lastName,
      pdgaNumberAsString,
    );

    if (!tournamentDate) {
      tournamentDate = new Date().toISOString().substring(0, 10);
    }

    return await this.membershipService.isPlayerActive(player, tournamentDate);
  }

  // Find a player using pdga number and names only.
  async findPlayer(
    firstName: string,
    lastName: string,
    pdgaNumber: string,
  ): Promise<Player> {
    let player: Player = null;

    // Best option is to use the PDGA Number
    if (pdgaNumber) {
      player = await this.playerService.findByPdgaNumber(pdgaNumber);
      if (player) {
        // We found a player with the right PDGA number.
        // Now we do a minimal name check, i.e if we were given a last name
        // it should occur somewhere in the player's full name.
        if (lastName && player.fullName.indexOf(lastName.toLowerCase()) < 1) {
          // if the name check fails
          logger.warn(
            `FIX? ==> Attempted match of "${firstName} ${lastName}" ` +
              `with PDGA Membership number ${pdgaNumber} (${player.fullName})`,
          );
          this.logAndThrowException(
            `The BCDS membership database knows of pdga number ${pdgaNumber} but ${lastName} ` +
              `is not in the name we have for the player.`,
          );
        }
      }
    }

    // If we have not found the player yet, let's try looking them up by name
    if (!player) {
      const players: Player[] = await this.playerService.findByName(
        `${firstName} ${lastName}`,
        pdgaNumber,
      );
      if (players.length > 1) {
        let message = `FIX? ==> Multiple matches on "${firstName} ${lastName}". `;
        if (pdgaNumber) {
          message = message.concat(`Looking for PDGA Number ${pdgaNumber}`);
        }
        for (const player of players) {
          message = message.concat(
            `\nid: ${player.id}, dob: ${player.dob}, pdga: ${player.pdgaNumber}`,
          );
        }
        this.logAndThrowException(message);
      }
      if (players.length === 1) {
        // With trepidation we call this a match
        player = players[0];
      }
    }
    return player;
  }

  async importBcdsMembershipGoogleDoc(): Promise<string> {
    const stats = new JobStats('Reload the BCDS membership spreadsheet.');
    stats.setStatus(JobState.IN_PROGRESS);

    const importData: ImportDto[] = await this.membershipSheetService.loadSheet(
      stats,
    );

    if (!importData) {
      return 'WTF';
    }

    stats.setCurrentActivity('Loading data into database');
    let rowNum = 0;
    for (const dto of importData) {
      rowNum++;

      // We can safely ignore any payment that has a payment confirmation code that we
      // have already processed.
      if (
        await this.paymentService.confirmationCodeExists(
          dto.payment.confirmationCode,
        )
      ) {
        stats.bump('already processed');
        continue;
      }

      const player = await this.playerService.lookupOrCreate(dto.player);
      if (!player) {
        logger.error(
          `Could not find a matching player for row ${rowNum}. Skipping`,
        );
        stats.bump('no matching player');
        stats.bump('rows skipped');
        continue;
      }

      // Make a membership record
      const membership = new Membership();
      membership.validFrom = dto.membership.validFrom;
      membership.validUntil = dto.membership.validUntil;
      membership.payment = plainToClass(Payment, dto.payment);
      membership.player = player;
      await this.membershipService.save(membership);
      stats.bump('row processed successfully');
    }
    stats.setStatus(JobState.DONE);
    return JSON.stringify(stats, null, 2);
  }

  logAndThrowException(msg: string) {
    logger.error(msg);
    throw new BadRequestException(msg);
  }
}
