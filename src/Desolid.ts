import { readFileSync } from 'fs-extra';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { DatabaseConfig, Database } from './database';
import { GraphQLAPIConfig, GraphQLAPI } from './api';
import { StorageConfig, Storage } from './storage';
import { Schema } from './schema';

export interface DesolidConfig {
    api: GraphQLAPIConfig;
    database: DatabaseConfig;
    storage: StorageConfig;
}

export default class Desolid {
    protected readonly config: DesolidConfig;
    protected readonly storage: Storage;
    protected readonly database: Database;
    protected readonly api: GraphQLAPI;
    protected readonly schema: Schema;

    constructor(public readonly root: string) {
        const configFile = readFileSync(path.join(root, 'desolid.yaml'), { encoding: 'utf8' });
        this.config = yaml.safeLoad(configFile);
        this.schema = new Schema(root);
        this.storage = new Storage(this.config.storage, root, this.schema.models);
        this.database = new Database(this.config.database, this.schema.models, this.storage);
        this.api = new GraphQLAPI(this.config.api, this.database.models, this.storage);
    }

    public async start() {
        await this.database.start();
        await this.api.start();
    }
}
