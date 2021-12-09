import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Player } from '../../players/entities/player.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { Exclude } from 'class-transformer';

@Entity()
export class Membership {
  @PrimaryGeneratedColumn()
  @Exclude()
  id: number;

  @Column()
  validFrom: Date;

  @Column()
  validUntil: Date;

  @ManyToOne(() => Player, (player) => player.memberships, {
    cascade: true,
  })
  player: Player;

  // Explicitly expose the playerId column as part of the entity
  @Column({ nullable: true })
  @Exclude()
  playerId: number;

  @OneToOne(() => Payment, {
    cascade: true,
  })
  @JoinColumn()
  @Exclude()
  payment: Payment;
}
