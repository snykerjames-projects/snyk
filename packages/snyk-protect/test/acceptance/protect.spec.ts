import * as fs from 'fs';
import protect from '../../src/lib';
import * as path from 'path';
import * as uuid from 'uuid';
import * as fse from 'fs-extra';

describe('@snyk/protect', () => {
  let tempFolder: string;

  beforeAll(() => {
    tempFolder = path.join(__dirname, '__output__', uuid.v4());
    fs.mkdirSync(tempFolder, { recursive: true });
  });

  afterAll(() => {
    fs.rmdirSync(tempFolder, {
      recursive: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('works for project with a single patchable module', async () => {
    const fixture = 'single-patchable-module';
    const fixtureFolder = path.join(__dirname, '../fixtures', fixture);
    const modulePath = path.join(tempFolder, fixture);
    const targeFilePath = path.join(
      modulePath,
      'node_modules/nyc/node_modules/lodash/lodash.js',
    );

    await fse.copy(fixtureFolder, modulePath);
    await protect(modulePath);

    const actualPatchedFileContents = fs.readFileSync(targeFilePath, 'utf-8');
    expect(actualPatchedFileContents).toMatchSnapshot();
  });

  it('works for project with multiple patchable modules', async () => {
    const fixture = 'multiple-matching-paths';
    const fixtureFolder = path.join(__dirname, '../fixtures', fixture);
    const modulePath = path.join(tempFolder, fixture);
    const targeFilePath1 = path.join(
      modulePath,
      'node_modules/nyc/node_modules/lodash/lodash.js',
    );
    const targeFilePath2 = path.join(
      modulePath,
      'node_modules/lodash/lodash.js',
    );

    await fse.copy(fixtureFolder, modulePath);
    await protect(modulePath);

    const actualPatchedFileContents = fs.readFileSync(targeFilePath1, 'utf-8');
    expect(actualPatchedFileContents).toMatchSnapshot();
    const actualPatchedFileContents2 = fs.readFileSync(targeFilePath2, 'utf-8');
    expect(actualPatchedFileContents2).toMatchSnapshot();
  });
});
