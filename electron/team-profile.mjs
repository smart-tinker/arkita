import path from 'node:path';
import * as nativeFS from 'node:fs/promises';
import { directoryBoundary } from './project-files.mjs';
import { readRegular } from './native-directory.mjs';
import { readTeamProfile, TEAM_PROFILE_LIMIT } from '../schemka-model-io/src/team-profile.js';
/** No search path, watcher, write or code execution: one explicitly distributed profile beside the executable. */
export async function readStartupTeamProfile({ executable = process.execPath, portableDirectory = process.env.PORTABLE_EXECUTABLE_DIR, fs = nativeFS } = {}) {
  const directory = portableDirectory || path.dirname(executable);
  if (!path.isAbsolute(directory)) throw Object.assign(Error('Каталог командного профиля должен быть абсолютным.'), { code: 'TEAM_PROFILE_PATH' });
  const filename = path.join(directory, 'arkita-team-profile.json');
  try {
    const guard = await directoryBoundary(directory, fs), { bytes: input } = await readRegular(filename, TEAM_PROFILE_LIMIT, guard, fs);
    return { status: 'ok', profile: readTeamProfile(input), name: path.basename(filename) };
  } catch (error) { if (error.code === 'ENOENT') return { status: 'absent' }; throw error; }
}
