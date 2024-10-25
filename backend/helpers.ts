import { constants } from 'fs';
import fs from 'fs/promises';
import { DatabaseMethod } from 'utils/db/types';
import { CUSTOM_EVENTS } from 'utils/messages';
import { KnexColumnType } from './database/types';

export const sqliteTypeMap: Record<string, KnexColumnType> = {
  AutoComplete: 'string',
  Currency: 'string',
  Int: 'integer',
  Float: 'float',
  Percent: 'float',
  Check: 'boolean',
  Code: 'string',
  Date: 'date',
  Datetime: 'datetime',
  Time: 'time',
  Text: 'string',
  Data: 'string',
  Link: 'string',
  DynamicLink: 'string',
  Password: 'string',
  Select: 'string',
  Attachment: 'string',
  AttachImage: 'string',
  Color: 'string',
};

export const SYSTEM = '__SYSTEM__';
export const validTypes = Object.keys(sqliteTypeMap);
export function getDefaultMetaFieldValueMap() {
  const now = new Date().toISOString();
  return {
    createdBy: SYSTEM,
    modifiedBy: SYSTEM,
    created: now,
    modified: now,
  };
}

export const databaseMethodSet: Set<DatabaseMethod> = new Set([
  'insert',
  'get',
  'getAll',
  'getSingleValues',
  'rename',
  'update',
  'delete',
  'deleteAll',
  'close',
  'exists',
]);

export function emitMainProcessError(
  error: unknown,
  more?: Record<string, unknown>
) {
  (
    process.emit as (
      event: string,
      error: unknown,
      more?: Record<string, unknown>
    ) => void
  )(CUSTOM_EVENTS.MAIN_PROCESS_ERROR, error, more);
}

export async function checkFileAccess(filePath: string, mode?: number) {
  mode ??= constants.W_OK;
  return await fs
    .access(filePath, mode)
    .then(() => true)
    .catch(() => false);
}

export async function unlinkIfExists(filePath: unknown) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const exists = await checkFileAccess(filePath);
  if (exists) {
    await fs.unlink(filePath);
    return true;
  }

  return false;
}
