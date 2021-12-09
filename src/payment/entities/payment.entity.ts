import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';
import { Type } from 'class-transformer';

@Entity()
export class Payment {
  @Column({
    nullable: true,
  })
  name: string;

  @Column({
    nullable: true,
  })
  address: string;

  @Column({
    nullable: true,
  })
  email: string;

  @Type(() => Date)
  @Column({
    nullable: true,
  })
  date: Date;

  @Column({
    nullable: true,
  })
  amount: string;

  @PrimaryColumn()
  confirmationCode: string;

  @Column({
    nullable: true,
  })
  source: string;

  @Column({
    nullable: true,
  })
  detail: string;
}
