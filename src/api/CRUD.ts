import { ObjectDefinitionBlock, intArg } from '@nexus/schema/dist/core';
import { GraphQLResolveInfo } from 'graphql';
import * as pluralize from 'pluralize';
import * as _ from 'lodash';
import {
    parseResolveInfo,
    simplifyParsedResolveInfoFragmentWithType,
    ResolveTree,
    FieldsByTypeName,
} from 'graphql-parse-resolve-info';
import { IncludeOptions } from 'sequelize';
import {
    CreateInput,
    UpdateInput,
    WhereInput,
    WhereUniqueInput,
    OrderBy,
    Authorization,
    AuthorizationCategory,
} from '.';
import { Model } from '../database';
import { Connection } from './archetypes/Connection';

export interface FindArgs {
    where: any;
    orderBy: string;
    offset: number;
    limit: number;
}

export interface SelectAttributes {
    attributes?: {};
    name: string;
    alias?: string;
    args?: {
        [str: string]: any;
    };
    fieldsByTypeName: FieldsByTypeName;
}

/**
 * @todo finish CRUDS
 */
export class CRUD {
    private readonly inputs: {
        create: CreateInput;
        update: UpdateInput;
        where: WhereInput;
        whereUnique: WhereUniqueInput;
        orderBy: OrderBy;
    } = {} as any;

    constructor(
        private readonly model: Model,
        private readonly authorization = new Authorization(model.typeDefinition),
    ) {
        this.inputs.create = new CreateInput(model);
        this.inputs.update = new UpdateInput(model);
        this.inputs.where = new WhereInput(model.typeDefinition);
        this.inputs.whereUnique = new WhereUniqueInput(model.typeDefinition);
        this.inputs.orderBy = new OrderBy(model.typeDefinition);
    }

    public generateQueries(t: ObjectDefinitionBlock<'Query'>) {
        t.field(this.model.name.toLowerCase(), {
            type: this.model.typeDefinition,
            args: { where: this.inputs.whereUnique.toArg(true) },
            resolve: this.findOne.bind(this),
        });
        t.field(`${pluralize(this.model.name.toLowerCase())}Connection`, {
            type: new Connection(this.model.typeDefinition),
            args: {
                where: this.inputs.where.toArg(false),
            },
            resolve: this.resolveConnection.bind(this),
        });
        t.list.field(pluralize(this.model.name.toLowerCase()), {
            type: this.model.typeDefinition,
            args: {
                where: this.inputs.where.toArg(false),
                orderBy: this.inputs.orderBy,
                offset: intArg(),
                limit: intArg(),
            },
            resolve: this.find.bind(this),
        });
    }

    public generateMutations(t: ObjectDefinitionBlock<'Mutation'>) {
        t.field(`create${this.model.name}`, {
            type: this.model.typeDefinition,
            args: { data: this.inputs.create.toArg(true) },
            resolve: this.createOne.bind(this),
        });

        t.list.field(`createMany${this.model.name}`, {
            type: this.model.typeDefinition,
            args: { data: this.inputs.create.toArg(true, [true]) },
            resolve: this.createMany.bind(this),
        });

        t.field(`update${this.model.name}`, {
            type: this.model.typeDefinition,
            args: {
                where: this.inputs.whereUnique.toArg(true),
                data: this.inputs.update.toArg(true),
            },
            resolve: this.updateOne.bind(this),
        });

        t.field(`updateMany${pluralize(this.model.name)}`, {
            type: this.model.typeDefinition.schema.get('BatchPayload'),
            args: {
                where: this.inputs.where.toArg(true),
                data: this.inputs.update.toArg(true),
            },
            resolve: this.updateMany.bind(this),
        });

        t.field(`delete${this.model.name}`, {
            type: this.model.typeDefinition,
            args: { where: this.inputs.whereUnique.toArg(true) },
            resolve: this.deleteOne.bind(this),
        });

        t.field(`deleteMany${pluralize(this.model.name)}`, {
            type: this.model.typeDefinition.schema.get('BatchPayload'),
            args: { where: this.inputs.where.toArg(true) },
            resolve: this.deleteMany.bind(this),
        });
    }

    /**
     *
     * @param select
     * @todo handle where on relations: https://stackoverflow.com/a/36391912/2179157
     *          https://gist.github.com/zcaceres/83b554ee08726a734088d90d455bc566#customized-include-with-alias-and-where
     */
    private parseSelectAttributes(select: { [key: string]: SelectAttributes }) {
        const attributes: string[] = [];
        const include: IncludeOptions[] = [];
        for (let [name, attribute] of Object.entries<SelectAttributes>(select)) {
            const [modelName] = Object.keys(attribute.fieldsByTypeName);
            if (modelName && this.model.datasource.associations[attribute.name]) {
                include.push({
                    association: attribute.name,
                    ...this.parseSelectAttributes(attribute.fieldsByTypeName[modelName] as any),
                });
            } else {
                attributes.push(name);
            }
        }
        return { attributes, include };
    }

    private parseResolveInfo(info: GraphQLResolveInfo, extraSelect?: { [key: string]: SelectAttributes }) {
        const select = simplifyParsedResolveInfoFragmentWithType(parseResolveInfo(info) as ResolveTree, info.returnType)
            .fields;
        return this.parseSelectAttributes(_.merge(select, extraSelect));
    }

    private async createOne(root: any, { data }: any, context: any, info: GraphQLResolveInfo) {
        const { attributes, include } = this.parseResolveInfo(info);
        await this.authorization.create(context.user, data);
        await this.inputs.create.validate(data);
        return this.model.createOne(data, attributes, include);
    }

    /**
     *
     * @todo we can check only if inputs contain files handle one by one
     */
    private async createMany(root: any, { data }: { data: any[] }, context: any, info: GraphQLResolveInfo) {
        const { attributes, include } = this.parseResolveInfo(info);
        await this.authorization.createMany(context.user, data);
        await Promise.all(data.map((item) => this.inputs.create.validate(item)));
        // we need to process items one by one to handle errors
        return Promise.all(data.map(async (item) => this.model.createOne(item, attributes, include)));
        // return this.model.createMany(data, attributes, include);
    }

    private async updateOne(root: any, { data, where }: any, context: any, info: GraphQLResolveInfo) {
        const { attributes, include } = this.parseResolveInfo(info);
        // We have to fetch attributes which we need on the authorization flow too
        const preflighAttributes = this.parseSelectAttributes(
            this.authorization.getSelectOf(AuthorizationCategory.UPDATE),
        );
        preflighAttributes.attributes.push('id');
        const record = await this.model.findOne(where, preflighAttributes.attributes, preflighAttributes.include);
        await this.authorization.update(context.user, record, data);
        await this.inputs.update.validate(data, record);
        return this.model.updateOne(where /** WhereUniqueInput */, data, attributes, include, record);
    }

    /**
     *
     * @todo we can check only if inputs contain files handle one by one
     */
    private async updateMany(root: any, { data, where }: any, context: any, info: GraphQLResolveInfo) {
        const { attributes, include } = this.parseResolveInfo(info);
        // We have to fetch attributes which we need on the authorization flow too
        const preflighAttributes = this.parseSelectAttributes(
            this.authorization.getSelectOf(AuthorizationCategory.UPDATE),
        );
        preflighAttributes.attributes.push('id');
        const records = await this.model.findAll(where, preflighAttributes.attributes, preflighAttributes.include);
        await this.authorization.updateMany(context.user, records, data);
        await Promise.all(records.map((record) => this.inputs.update.validate(data, record)));
        // we need to process items one by one to handle errors
        return Promise.all(
            records.map(async (item) => this.model.updateOne({ id: item.id }, data, attributes, include, item)),
        );
        // return this.model.updateMany(
        //     this.inputs.where.parse(where) /** WhereInput */,
        //     data,
        //     attributes,
        //     include,
        //     records,
        // );
    }

    private async deleteOne(root: any, { where }: any, context: any, info: GraphQLResolveInfo) {
        // We have to fetch attributes which we need on the authorization flow too
        const { attributes, include } = this.parseResolveInfo(
            info,
            this.authorization.getSelectOf(AuthorizationCategory.DELETE),
        );
        const record = await this.model.findOne(where, attributes, include);
        if (record) {
            await this.authorization.delete(context.user, record);
        } else {
            throw new Error(`Not found the '${this.model.name}' where ${JSON.stringify(where)}.`);
        }
        await this.model.deleteOne(where, attributes, include);
        return record;
    }

    private async deleteMany(root: any, { where }: any, context: any, info: GraphQLResolveInfo) {
        // const { attributes, include } = this.parseResolveInfo(info);
        // We have to fetch attributes which we need on the authorization flow too
        const preflighAttributes = this.parseSelectAttributes(
            this.authorization.getSelectOf(AuthorizationCategory.UPDATE),
        );
        preflighAttributes.attributes.push('id');
        const records = await this.model.findAll(where, preflighAttributes.attributes, preflighAttributes.include);
        await this.authorization.deleteMany(context.user, records);
        return this.model.deleteMany(this.inputs.where.parse(where));
    }

    private async find(root: any, { where, orderBy, offset, limit }: FindArgs, context: any, info: GraphQLResolveInfo) {
        // We have to fetch attributes which we need on the authorization flow too
        const { attributes, include } = this.parseResolveInfo(
            info,
            this.authorization.getSelectOf(AuthorizationCategory.READ),
        );
        const records = await this.model.findAll(
            this.inputs.where.parse(where),
            attributes,
            include,
            this.inputs.orderBy.parse(orderBy),
            limit,
            offset,
        );
        await this.authorization.readAll(context.user, records);
        return records;
    }

    private async findOne(root: any, { where }: any, context: any, info: GraphQLResolveInfo) {
        // We have to fetch attributes which we need on the authorization flow too
        const { attributes, include } = this.parseResolveInfo(
            info,
            this.authorization.getSelectOf(AuthorizationCategory.READ),
        );
        const record = await this.model.findOne(where, attributes, include);
        if (!record) {
            throw new Error(`Not found.`);
        } else {
            this.authorization.read(context.user, record);
            return record;
        }
    }

    private async resolveConnection(root: any, { where }: FindArgs, context: any, info: GraphQLResolveInfo) {
        return {
            aggregate: {
                count: await this.model.datasource.count({ where }),
            },
        };
    }
}
