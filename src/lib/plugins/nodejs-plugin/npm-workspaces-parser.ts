import * as baseDebug from 'debug';
import * as pathUtil from 'path';
import * as _ from '@snyk/lodash';

const debug = baseDebug('snyk:yarn-workspaces');
import * as fs from 'fs';
import * as lockFileParser from 'snyk-nodejs-lockfile-parser';
import * as path from 'path';
import { NoSupportedManifestsFoundError } from '../../errors';
import {
  MultiProjectResultCustom,
  ScannedProjectCustom,
} from '../get-multi-plugin-result';

export async function processNpmWorkspaces(
  root: string,
  settings: {
    strictOutOfSync?: boolean;
    dev?: boolean;
  },
  targetFiles: string[],
): Promise<MultiProjectResultCustom> {
  // the order of folders is important
  // must have the root level most folders at the top
  const npmTargetFiles: {
    [dir: string]: Array<{
      path: string;
      base: string;
      dir: string;
    }>;
  } = _(targetFiles)
    .map((p) => ({ path: p, ...pathUtil.parse(p) }))
    .filter((res) => ['package.json'].includes(res.base))
    .sortBy('dir')
    .groupBy('dir')
    .value();

  debug(`processing Npm lerna packages (${targetFiles.length})`);
  if (Object.keys(npmTargetFiles).length === 0) {
    throw NoSupportedManifestsFoundError([root]);
  }
  let npmWorkspacesMap = {};
  const yarnWorkspacesFilesMap = {};
  let isYarnWorkspacePackage = false;
  const result: MultiProjectResultCustom = {
    plugin: {
      name: 'snyk-nodejs-npm-lerna',
      runtime: process.version,
    },
    scannedProjects: [],
  };
  // the folders must be ordered highest first
  for (const directory of Object.keys(npmTargetFiles)) {
    const packageJsonFileName = pathUtil.join(directory, 'package.json');
    const lernaFileName = pathUtil.join(directory, 'lerna.json');
    let lernaFile;
    try {
      lernaFile = getFileContents(root, lernaFileName);
    } catch (e) {
      // nothing
    }
    const packageJson = getFileContents(root, packageJsonFileName);
    if (lernaFile) {
      npmWorkspacesMap = {
        ...npmWorkspacesMap,
        ...getWorkspacesMap(lernaFile),
      };
    }
    for (const workspaceRoot of Object.keys(npmWorkspacesMap)) {
      const workspaces = npmWorkspacesMap[workspaceRoot].workspaces || [];
      const match = workspaces
        .map((pattern) => {
          return packageJsonFileName.includes(pattern.replace(/\*/, ''));
        })
        .filter(Boolean);

      if (match) {
        yarnWorkspacesFilesMap[packageJsonFileName] = {
          root: workspaceRoot,
        };
        isYarnWorkspacePackage = true;
      }
    }

    if (isYarnWorkspacePackage) {
      const rootDir = path.dirname(
        yarnWorkspacesFilesMap[packageJsonFileName].root,
      );
      const rootLockfileName = path.join(rootDir, 'package-lock.json');

      const packageLock = await getFileContents(root, rootLockfileName);
      const res = await lockFileParser.buildDepTree(
        packageJson.content,
        packageLock.content,
        settings.dev,
        lockFileParser.LockfileType.npm,
        settings.strictOutOfSync !== false,
      );
      const project: ScannedProjectCustom = {
        packageManager: 'npm',
        targetFile: path.relative(root, packageJson.name),
        depTree: res as any,
        plugin: {
          name: 'snyk-nodejs-npm-lerna',
          runtime: process.version,
        },
      };
      result.scannedProjects.push(project);
    }
  }
  return result;
}

function getFileContents(
  root: string,
  fileName: string,
): {
  content: string;
  name: string;
} {
  const fullPath = path.resolve(root, fileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      'Manifest ' + fileName + ' not found at location: ' + fileName,
    );
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  return {
    content,
    name: fileName,
  };
}

interface YarnWorkspacesMap {
  [packageJsonName: string]: {
    workspaces: string[];
  };
}

export function getWorkspacesMap(file: {
  content: string;
  name: string;
}): YarnWorkspacesMap {
  const yarnWorkspacesMap = {};
  if (!file) {
    return yarnWorkspacesMap;
  }

  try {
    const rootFileWorkspacesDefinitions = getNpmPackages(
      file.content,
    );

    if (rootFileWorkspacesDefinitions && rootFileWorkspacesDefinitions.length) {
      yarnWorkspacesMap[file.name] = {
        workspaces: rootFileWorkspacesDefinitions,
      };
    }
  } catch (e) {
    debug('Failed to process a workspace', e.message);
  }
  return yarnWorkspacesMap;
}


export function getNpmPackages(content: string): string[] | false {
  try {
    const lernaJson = JSON.parse(content);
    if (lernaJson.packages) {
      const workspacesPackages = lernaJson.packages as string[];
      const workspacesAlternateConfigPackages = (workspacesPackages as any)
        .packages;
      return [...(workspacesAlternateConfigPackages || workspacesPackages)];
    }
    return false;
  } catch (e) {
    throw new Error(
      'package.json parsing failed with ' + `error ${e.message}`,
    );
  }
}