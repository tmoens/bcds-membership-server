import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Player } from './entities/player.entity';
import { Brackets, Repository } from 'typeorm';
import { getLogger } from 'log4js';
import { ImportPlayerDto } from '../membership-sheet/importDtos';

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

  async findPlayer(name: string, pdgaNumber: string): Promise<Player | null> {
    let player: Player;
    if (pdgaNumber) {
      // See if we know the  bcds player, if not add the player to our db.
      player = await this.findOrCreatePdgaPlayer(name, pdgaNumber);
    } else {
      // player does not have a pdga number.
      // And yet we may know them by name.
      // if there is exactly one player with the exact name, consider it to be a match
      player = await this.findExactlyOneByNameNoPdgaNumber(name);
    }
    return player;
  }

  // Someone is asking about a player with a known name & PDGA Number
  async findOrCreatePdgaPlayer(
    name: string,
    pdgaNumber: string,
  ): Promise<Player> {
    // Let's see if we already know the player by their pdga number
    let player: Player = await this.findByPdgaNumber(pdgaNumber);

    // We do know the player!
    if (player) {
      // But players can enter different tournaments with different names, so
      // let's remember all of them.
      if (player.aka(name)) {
        player = await this.repo.save(player);
        logger.info(
          `Adding alias name to player ${JSON.stringify(player, null, 2)}`,
        );
      }
    } else {
      // We don't know the player by their pdga number.
      // Let's see if we there is exactly one player with this name who has no pdga number
      player = await this.findExactlyOneByNameNoPdgaNumber(name);

      if (player) {
        // We found one.  With trepidation, we assign them the PDGA number.
        player.pdgaNumber = pdgaNumber;
        player = await this.repo.save(player);
        logger.info(
          `Adding pdga number to player ${JSON.stringify(player, null, 2)}`,
        );
      } else {
        // we did not find the player in the database.  But we do know a valid
        // name and PDGA number combination, what's the harm in adding the player
        // to our player database?
        player = new Player();
        player.fullName = name;
        player.pdgaNumber = pdgaNumber;
        player = await this.repo.save(player);
        logger.info(`Creating a player based on data from the PDGA:
         ${JSON.stringify(player, null, 2)}`);
      }
    }
    return player;
  }

  async findByPdgaNumber(pdgaNumber: string): Promise<Player | null> {
    return this.repo.findOne({ where: { pdgaNumber: pdgaNumber } });
  }

  // We are looking for a player by name, who also has no PDGA number.
  // If there are multiple matches we have no way of knowing if it is the right one.
  async findExactlyOneByNameNoPdgaNumber(name: string): Promise<Player> {
    const players: Player[] = await this.repo
      .createQueryBuilder('p')
      .where('p.pdgaNumber IS NULL')
      .andWhere(
        new Brackets((qb) => {
          qb.where('p.fullName = :name', { name: name })
            .orWhere(`p.aliases LIKE '%${name}%'`)
        }),
      )
      .getMany();
    if (!players || players.length > 1) {
      return null;
    } else {
      return players[0];
    }
  }

  async findByNameOrAlias(name: string): Promise<Player[]> {
    return this.repo
      .createQueryBuilder('p')
      .where('p.fullName = :name', { name: name })
      .orWhere(`p.aliases LIKE '%${name}%'`)
      .getMany();
  }

  async findByName(name: string, pdgaNumber: string): Promise<Player[]> {
    // Note: IF the player's pdga number is given as a parameter, AND
    // the player has a PDGA number in the db (some don't) THEN
    // the two must match.
    let query = this.repo
      .createQueryBuilder('p')
      .where('p.fullName = :name', { name: name });
    if (pdgaNumber) {
      query = query.andWhere(
        new Brackets((qb) => {
          qb.where('p.pdgaNumber IS NULL')
            .orWhere(`p.pdgaNumber = ':pdgaNumber'`, { pdgaNumber: pdgaNumber })
        }),
      );
    }
    return query.getMany();
  }

  async lookupOrCreate(dto: ImportPlayerDto): Promise<Player | null> {
    let player: Player;

    // most reliable match is on pdga number
    if (dto.pdgaNumber) {
      player = await this.repo.findOne({
        where: { pdgaNumber: dto.pdgaNumber },
      });
      if (player) {
        if (player.fullName !== dto.fullName) {
          // If the PDGA numbers match, but the names don't, it is a serious conundrum.
          // Can we simply overwrite the name?  I don;t think so.  Just issue a warning and give up.
          logger.error(
            `FIX ==> PDGA number ${dto.pdgaNumber} is called '${dto.fullName}' in the spreadsheet but '${player.fullName}' in the db`,
          );
          return null;
        }
        // if the dto and the existing players both have birth dates and they do not match, it's an error.
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
