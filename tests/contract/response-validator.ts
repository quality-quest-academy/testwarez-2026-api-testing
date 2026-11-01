import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv-draft-04';
import addFormats from 'ajv-formats';
import type { OpenAPIV3 } from 'openapi-types';

// A body-only checker for the JSON Schema subset in our OpenAPI 3.0 specs.
// Schemathesis separately checks HTTP status, content type, headers and body.
export async function responseValidator(service: 'products' | 'orders', path: string, method: 'get' | 'post', status: number) {
  const document = await SwaggerParser.dereference(`contracts/${service}.openapi.yaml`) as OpenAPIV3.Document;
  const response = document.paths[path]?.[method]?.responses[String(status)] as OpenAPIV3.ResponseObject | undefined;
  const schema = response?.content?.['application/json']?.schema;
  if (schema === undefined) throw new Error(`No JSON response schema for ${method.toUpperCase()} ${path} ${status}`);
  const ajv = new Ajv.default({ strict: false, allErrors: true });
  addFormats.default(ajv);
  const validate = ajv.compile(schema);
  return (body: unknown): string[] => {
    if (validate(body)) return [];
    return (validate.errors ?? []).map((error) =>
      `${service} ${method.toUpperCase()} ${path} ${status}: ${error.instancePath || '/'} ${error.message} (${JSON.stringify(error.params)})`,
    );
  };
}
