import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum RemoteServerStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    MAINTENANCE = 'maintenance',
}

@Entity('remote_servers')
export class RemoteServer {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    url: string;

    @Column()
    ownerId: string;

    @Column({ nullable: true })
    description?: string;

    @Column({ type: 'simple-json', nullable: true })
    config?: Record<string, any>;

    @Column({
        type: 'simple-enum',
        enum: RemoteServerStatus,
        default: RemoteServerStatus.ACTIVE,
    })
    status: RemoteServerStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
