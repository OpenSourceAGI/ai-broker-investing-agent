import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yaml from 'js-yaml';

describe('OpenAPI Generator', () => {
  const baseExchangePath = path.join(__dirname, '../src/BaseExchange.ts');
  const specPath = path.join(__dirname, '../src/server/openapi.yaml');
  let originalContent: string;

  beforeAll(() => {
    originalContent = fs.readFileSync(baseExchangePath, 'utf-8');
  });

  afterAll(() => {
    fs.writeFileSync(baseExchangePath, originalContent, 'utf-8');
  });

  it('auto-generates new methods from BaseExchange.ts', () => {
    // Add a dummy test method
    const testMethod = `
    /**
     * Test method for auto-generation verification.
     */
    async testDummyMethod(param?: string): Promise<string> {
      throw new Error("Test method not implemented.");
    }`;

    const newContent = originalContent.replace(
      'async close(): Promise<void> {',
      testMethod + '\n\n    async close(): Promise<void> {'
    );
    fs.writeFileSync(baseExchangePath, newContent, 'utf-8');

    // Run generator
    execSync('node scripts/generate-openapi.js', { cwd: path.join(__dirname, '..') });

    // Verify the spec contains the new method
    const specContent = fs.readFileSync(specPath, 'utf-8');
    const spec = yaml.load(specContent) as any;

    expect(spec.paths['/api/{exchange}/testDummyMethod']).toBeDefined();
    expect(spec.paths['/api/{exchange}/testDummyMethod'].post.operationId).toBe('testDummyMethod');
    expect(spec.paths['/api/{exchange}/testDummyMethod'].post.summary).toBe('Test Dummy Method');
  });
});
