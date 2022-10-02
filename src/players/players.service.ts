import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Player } from './entities/player.entity';
import { Brackets, Repository } from 'typeorm';
import { getLogger } from 'log4js';
import { ImportPlayerDto } from '../membership-sheet/importDtos';
import { PdgaPlayerMini } from '../pdga-api/pdga-api.service';

const logger = getLogger('playersService');

@Injectable()
export class PlayersService {
  constructor(
    @InjectRepository(Player)
    private repo: Repository<Player>,
  ) {}

  findAll() {
    return `This action returns all players`;
  }

  findOne(id: number) {
    return `This action returns a #${id} player`;
  }

  remove(id: number) {
    return `This action removes a #${id} player`;
  }

  // We got a player form the PDGA - just a name and usually, but not always,
  // a PDGA Number too
  async processPdgaPlayer(pdgaPlayer: PdgaPlayerMini): Promise<Player | null> {
    // Let's see if we already know the player by their pdga number
    let player: Player | null;
    if (pdgaPlayer.pdgaNumber) {
      player = await this.findByPdgaNumber(pdgaPlayer.pdgaNumber);
      if (player) {
        // We do know the player!
        // But players can enter different tournaments with different names, so
        // let's remember all of them.
        if (player.trackAliases(pdgaPlayer.name)) {
          player = await this.repo.save(player);
          logger.info(
            `Adding alias name to player ${JSON.stringify(player, null, 2)}`,
          );
        }
      } else {
        // We don't know the player by their pdga number.
        // Let's see if there is exactly one player with this name (or alias) who
        // has no pdga number
        player = await this.findExactlyOneByNameNoPdgaNumber(pdgaPlayer.name);

        if (player) {
          // We found one.  With trepidation, we assign them the PDGA number.
          player.pdgaNumber = pdgaPlayer.pdgaNumber;
          player = await this.repo.save(player);
          logger.info(
            `Adding pdga number to player ${JSON.stringify(player, null, 2)}`,
          );
        } else {
          // we did not find the player in the database.  But we do know a valid
          // name and PDGA number combination, what's the harm in adding the player
          // to our player database?
          player = new Player();
          player.fullName = pdgaPlayer.name;
          player.pdgaNumber = pdgaPlayer.pdgaNumber;
          player = await this.repo.save(player);
          logger.info(`Creating a player based on data from the PDGA:
         ${JSON.stringify(player, null, 2)}`);
        }
      }
    } else {
      // we got a pdga player with only a name, let's see if we can find a player
      // with an exact match in name or alias
      player = await this.findExactlyOneByNameOrAlias(pdgaPlayer.name);
    }
    return player;
  }

  async findByPdgaNumber(pdgaNumber: string): Promise<Player | null> {
    return this.repo.findOne({ where: { pdgaNumber: pdgaNumber } });
  }

  // We are looking for a player by name (or alias), who also has no PDGA number.
  // If there are multiple matches we have no way of knowing if it is the right one.
  async findExactlyOneByNameNoPdgaNumber(name: string): Promise<Player | null> {
    const players: Player[] = await this.repo
      .createQueryBuilder('p')
      .where('p.pdgaNumber IS NULL')
      .andWhere(
        new Brackets((qb) => {
          qb.where('p.fullName = :name', { name: name })
            .orWhere(`p.aliases LIKE "%${name}%"`)
        }),
      )
      .getMany();
    // The above query is imperfect let's say the "name" is 'fred roberts'
    // the query will find any player with an alias of 'fred robertson'
    // so we have to go through the returned players and double-check
    let player: Player | null = null;
    for (const p of players) {
      if (p.isKnownAs(name)) {
        if (player) {
          // oh dear, we found a second player to have this name or alias,
          // can't say we found exactly one
          return null;
        } else {
          // ok, we found a player with the right name or alias, but we have to keep
          // looking for more.
          player = p;
        }
      }
    }
    return player;
  }

  async findExactlyOneByNameOrAlias(name: string): Promise<Player | null> {
    const players: Player[] = await this.repo
      .createQueryBuilder('p')
      .where(`p.fullName LIKE '%${name}%'`)
      .orWhere(`p.aliases LIKE '%${name}%'`)
      .getMany();
    // The above query is imperfect let's say the "name" is 'fred roberts'
    // the query will find any player with an alias of 'fred robertson'
    // so we have to go through the returned players and double-check
    let player: Player | null = null;
    for (const p of players) {
      if (p.isKnownAs(name)) {
        if (player) {
          // oh dear, we found a second player to have this name or alias,
          // can't say we found exactly one
          return null;
        } else {
          // ok, we found a player with the right name or alias, but we have to keep
          // looking for more.
          player = p;
        }
      }
    }
    return player;
  }

  // looking for all players whose name or alias match a search string.
  async findByNameOrAlias(name: string): Promise<Player[]> {
    return this.repo
      .createQueryBuilder('p')
      .where(`p.fullName LIKE '%${name}%'`)
      .orWhere(`p.aliases LIKE '%${name}%'`)
      .getMany();
  }

  async lookupOrCreate(dto: ImportPlayerDto): Promise<Player | null> {
    let player: Player;

    // If we are given a PDGA number, do the lookup based on that. It is reliable.
    if (dto.pdgaNumber) {
      player = await this.repo.findOne({
        where: { pdgaNumber: dto.pdgaNumber },
      });
      if (player) {
        if (!player.isKnownAs(dto.fullName)) {
          // If the PDGA numbers match, but the names don't, it is a serious conundrum.
          // So, I'm going to add an alias.  It will be right most of the time unless
          // someone puts in a bad PDGA Number.
          if (player.trackAliases(dto.fullName)) {
            player = await this.repo.save(player);
            logger.info(
              `Adding alias name to player ${JSON.stringify(player, null, 2)}`,
            );
          }
        }
        // if the dto and the existing players both have birthdays, and they do not match, it's an error.
        if (dto.dob) {
          if (player.dob) {
            if (
              player.dob.toISOString().substring(0, 10) !==
              dto.dob.toISOString().substring(0, 10)
            ) {
              logger.error(
                `FIX ==> PDGA number ${
                  dto.pdgaNumber
                } has dob ${dto.dob.toISOString()} in the spreadsheet but ${player.dob.toISOString()} in the db`,
              );
              return null;
            }
          } else {
            player.dob = dto.dob;
          }
        }
        if (dto.email) player.email = dto.email;
        if (dto.address) player.address = dto.address;
        if (dto.city) player.city = dto.city;
        player = await this.repo.save(player);
        return player;
      }
    }

    // No match was found on PDGA number we now go into gray territory
    // Try a lookup by name
    const candidates: Player[] = await this.repo.find({
      where: { fullName: dto.fullName },
    });
    let bestCandidate: Player = null;
    if (candidates.length > 0) {
      let bestScore = 0;
      for (const candidate of candidates) {
        const score: number = this.evaluateCandidate(candidate, dto);
        // logger.info(`Score: ${score}, Candidate: \n${JSON.stringify(candidate, null, 2)}`)
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }
    }

    // If we found no decent candidate, create one.
    if (!bestCandidate) {
      bestCandidate = new Player();
    }

    bestCandidate.fullName = dto.fullName;
    if (dto.pdgaNumber) bestCandidate.pdgaNumber = dto.pdgaNumber;
    if (dto.address) bestCandidate.address = dto.address;
    if (dto.dob) bestCandidate.dob = dto.dob;
    if (dto.email) bestCandidate.email = dto.email;
    if (dto.city) bestCandidate.city = dto.city;

    return bestCandidate;
  }

  // Compare a candidate player in the db against an import DTO identifying
  // score the quality of the comparison.
  // We already know there is a match on names.
  evaluateCandidate(player: Player, dto: ImportPlayerDto): number {
    // start with a minimally acceptable score of 1 because the names match
    let score = 1;

    // if the candidate in the db has a dob AND a dob is given
    // a mismatch on dob is a definitive error
    // a match is pretty much definitively correct
    if (dto.dob && player.dob) {
      if (
        player.dob.toISOString().substring(0, 10) !==
        dto.dob.toISOString().substring(0, 10)
      ) {
        score = -1000000;
        logger.info(
          `FIX? ==> ${
            player.fullName
          } has dob ${dto.dob.toISOString()} in the spreadsheet but ${player.dob.toISOString()} in the db`,
        );
      } else {
        score = score + 1000;
      }
    }

    // if the candidate in the db has a pdga number AND a pdga number is given
    // a mismatch on PDGA Number is a definitive error
    // a match is pretty much definitively correct
    if (
      player.pdgaNumber &&
      dto.pdgaNumber &&
      player.pdgaNumber !== dto.pdgaNumber
    ) {
      score = -1000000;
      logger.info(
        `FIX? ==> ${player.fullName} has pdga# ${dto.pdgaNumber} in the spreadsheet but ${player.pdgaNumber} in the db`,
      );
    } else {
      score = score + 100;
    }

    // if email for both is provided
    // a match is pretty great,
    // a mismatch is not definitively wrong
    if (player.email && dto.email && player.email !== dto.email) {
      logger.info(
        `FIX? ==> ${player.fullName} has email ${dto.email} in the spreadsheet but ${player.email} in the db`,
      );
    } else {
      score = score + 20;
    }

    // if address for both is provided
    // a match is pretty great,
    // a mismatch is not definitively wrong
    if (player.address && dto.address && player.address !== dto.address) {
      logger.info(
        `FIX? ==> ${player.fullName} has address ${dto.address} in the spreadsheet but ${player.address} in the db`,
      );
    } else {
      score = score + 10;
    }
    return score;
  }
}
