import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv-draft-04';
import addFormats from 'ajv-formats';
import type { OpenAPIV3 } from 'openapi-types';

type ObjectValue = Record<string, unknown>;

function isObject(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Schema-tooling only: this supports the subset used by our authored specs,
// not arbitrary OpenAPI-only keywords such as nullable. No running APIs.
export async function loadContract(service: 'products' | 'orders') {
  const path = `contracts/${service}.openapi.yaml`;
  await SwaggerParser.validate(path);
  const document = await SwaggerParser.dereference(path) as OpenAPIV3.Document;
  const ajv = new Ajv.default({ strict: false, allErrors: true });
  addFormats.default(ajv);
  return { document, ajv, schemas: document.components?.schemas as Record<string, ObjectValue> };
}

export function authoredExamples(document: OpenAPIV3.Document) {
  const examples: { schema: object; value: unknown }[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!isObject(value)) return;
    const schema = isObject(value.schema) ? value.schema : value;
    if ('example' in value) examples.push({ schema, value: value.example });
    if (isObject(value.schema) && isObject(value.examples)) {
      for (const example of Object.values(value.examples)) {
        if (isObject(example) && 'value' in example) examples.push({ schema: value.schema, value: example.value });
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'example' && key !== 'examples') visit(child);
    }
  }
  visit(document);
  return examples;
}
