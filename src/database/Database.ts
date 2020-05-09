import { Options, Sequelize } from 'sequelize';
import { TypeDefinition } from 'src/schema';
import { Model } from './Model';
import { MapX } from 'src/utils';

export type DatabaseConfig = Options;

export class Database {
    private readonly connection: Sequelize;
    public readonly models = new MapX<string, Model>();

    constructor(protected config: DatabaseConfig, modelTypeDefs: MapX<string, TypeDefinition>) {
        this.connection = new Sequelize(this.config);
        modelTypeDefs.forEach((typeDefinition: TypeDefinition) => {
            this.models.set(typeDefinition.name, new Model(this.connection, typeDefinition));
        });
        this.models.forEach((model) => model.schema.associate(this.models));
    }

    public async start() {
        await this.connection.sync({ force: false });
    }
}
