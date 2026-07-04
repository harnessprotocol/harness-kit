// Type stub for the @generated validate.generated.js (see scripts/generate-validator.ts).
// Kept minimal and ajv-agnostic so the runtime validation path carries no ajv types.

export interface CompiledValidator {
  (data: unknown): boolean;
  errors?:
    | Array<{
        instancePath: string;
        schemaPath: string;
        keyword: string;
        message?: string;
        params: Record<string, unknown>;
      }>
    | null;
}

declare const validate: CompiledValidator;
export default validate;
export { validate };
