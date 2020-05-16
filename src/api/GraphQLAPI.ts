import { makeSchema, queryType, mutationType } from '@nexus/schema/dist/core';
import { GraphQLServer } from 'graphql-yoga';
import * as _ from 'lodash';
import { scalars } from '../schema';
import { Model } from '../database';
import { Storage } from '../storage';
import { CRUD, Authenticate } from '.';
import { MapX, log } from '../utils';

export interface GraphQLAPIConfig {
    port: number;
    secret: string;
    upload: {
        maxFileSize: number;
    };
}

export class GraphQLAPI {
    private readonly defaultConfig: GraphQLAPIConfig = {
        port: 3000,
        secret: 'secret',
        upload: {
            maxFileSize: 64, //MB
        },
    };
    private readonly config: GraphQLAPIConfig;
    private readonly cruds = new MapX<string, CRUD>();
    private readonly authenticate: Authenticate;
    private server: GraphQLServer;

    constructor(
        config: GraphQLAPIConfig,
        models: MapX<string, Model>,
        private readonly storage: Storage,
    ) {
        this.config = _.merge({}, this.defaultConfig, config);
        this.authenticate = new Authenticate(models.get('User'), this.config.secret);
        models.forEach((model) => {
            this.cruds.set(model.name, new CRUD(model, storage));
        });
    }

    private generateSchema(outputs: any) {
        return makeSchema({
            types: [
                ...scalars,
                queryType({
                    definition: (t) => {
                        this.authenticate.generateQueries(t);
                        this.cruds.forEach((crud) => crud.generateQueries(t));
                    },
                }),
                mutationType({
                    definition: (t) => {
                        this.authenticate.generateMutations(t);
                        this.cruds.forEach((crud) => crud.generateMutations(t));
                    },
                }),
            ],
            outputs,
        });
    }

    public async start() {
        const schema = this.generateSchema({
            // typegen: __dirname + '/generated/typings.ts',
            // schema: __dirname + '/generated/schema.graphql',
        });
        this.server = new GraphQLServer({
            schema,
            middlewares: [this.authenticate.middleware, this.storage.middleware],
            context: (req) => ({ ...req }),
        });
        const maxFileSize = this.config.upload?.maxFileSize || 64;
        await this.server.start({
            port: process.env.PORT || this.config.port || 3000,
            uploads: {
                maxFileSize: maxFileSize * Math.pow(1024, 2), //MB
            },
        });
        log(`Server is running on http://localhost:${this.server.options.port}`);
    }
}
