import { NexusInputFieldConfig } from 'nexus/dist/core';
import { Input } from '.';
import { FieldDefinition } from '..';
import { DesolidObjectTypeDef } from '../../schema';

export class CreateInput extends Input {
    constructor(protected readonly model: DesolidObjectTypeDef) {
        super(model, `${model.name}CreateInput`);
    }

    public get fields() {
        // remove auto fill fields
        return this.model.fields.filter(
            (field) => !field.directives.createdAt && !field.directives.updatedAt,
        );
    }

    /**
     *
     * @todo handle file upload
     */
    protected configField(field: FieldDefinition): NexusInputFieldConfig<string, string> {
        return {
            required: field.type == 'ID' ? false : !field.config.nullable,
        } as NexusInputFieldConfig<string, string>;
    }
}