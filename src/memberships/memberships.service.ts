import { Injectable } from '@nestjs/common';
import { Membership } from './entities/membership.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from '../players/entities/player.entity';
import { MembershipState } from '../dtos/membership-state';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership) private repo: Repository<Membership>,
  ) {}

  async save(membership: Membership): Promise<Membership> {
    return this.repo.save(membership);
  }
  findAll() {
    return `This action returns all memberships`;
  }

  findOne(id: number) {
    return `This action returns a #${id} membership`;
  }

  remove(id: number) {
    return `This action removes a #${id} membership`;
  }

  async getMembershipState(
    player: Player,
    asOfDate: string,
  ): Promise<MembershipState> {
    if (!player || !player.id) {
      return MembershipState.PLAYER_NOT_KNOWN;
    }
    const membership = await this.repo
      .createQueryBuilder('m')
      .where('m.playerId = :playerId', { playerId: player.id })
      .andWhere('m.validFrom <= :date', { date: asOfDate })
      .andWhere('m.validUntil >= :date', { date: asOfDate })
      .getOne();
    if (membership) {
      return MembershipState.ACTIVE_MEMBER;
    } else {
      return MembershipState.PREVIOUS_MEMBER;
    }
  }

  async getMemberships(playerId: number): Promise<Membership[]> {
    return await this.repo
      .createQueryBuilder('m')
      .where('m.playerId = :playerId', { playerId: playerId })
      .orderBy('m.validFrom')
      .getMany();
  }
}

//=CONCATENATE(DEC2HEX(RANDBETWEEN(0, 4294967295), 10),DEC2HEX(RANDBETWEEN(0, 4294967295), 10))
