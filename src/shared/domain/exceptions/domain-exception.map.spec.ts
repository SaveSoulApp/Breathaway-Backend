import * as fs from 'fs';
import * as path from 'path';
import { DOMAIN_EXCEPTION_HTTP_MAP } from './domain-exception.map';

// Recursively read all files in a directory
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

describe('DOMAIN_EXCEPTION_HTTP_MAP', () => {
  it('should have an entry for every DomainException subclass and vice versa', () => {
    const srcPath = path.join(__dirname, '../../../../src');

    // 1. Find all *.exception.ts files
    const exceptionFiles = getAllFiles(srcPath).filter(
      (f) => f.endsWith('.exception.ts') && !f.endsWith('domain.exception.ts'),
    );

    // 2. Extract class names extending DomainException
    const exceptionClassNames = exceptionFiles
      .map((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        const match = content.match(
          /export class (\w+) extends DomainException/,
        );
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];

    const mapKeys = Object.keys(DOMAIN_EXCEPTION_HTTP_MAP);

    // 3. Ensure no dead code (keys in map that don't exist as actual classes)
    mapKeys.forEach((key) => {
      expect(exceptionClassNames).toContain(key);
    });

    // 4. Ensure no unmapped exceptions (classes that aren't registered in the map)
    exceptionClassNames.forEach((className) => {
      expect(mapKeys).toContain(className);
    });
  });
});
