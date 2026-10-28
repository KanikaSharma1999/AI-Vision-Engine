import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { InspectionRun } from './api';

const DOWNLOAD_DIR_KEY = 'downloadDirUri';

export class SaveCancelledError extends Error {}

function buildFileName(run: InspectionRun) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const product = String(run.product || 'inspection')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
  return `inspection_${product}_${stamp}.json`;
}

function writeInto(directory: Directory, run: InspectionRun) {
  const fileName = buildFileName(run);
  const file = directory.createFile(fileName, 'application/json');
  file.write(JSON.stringify(run, null, 2));
  return { fileName, folder: directory.name || 'the selected folder' };
}

async function pickAndRememberDirectory() {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (e) {
    // Closing the picker without choosing a folder rejects the promise.
    throw new SaveCancelledError(e instanceof Error ? e.message : 'Folder selection cancelled.');
  }
  await AsyncStorage.setItem(DOWNLOAD_DIR_KEY, directory.uri);
  return directory;
}

// DOWNLOAD: saves the JSON file onto the phone.
// First time (or when forcePick is true) Android asks you to choose a folder
// once; that folder is remembered, so later downloads save instantly with no
// picker. If the remembered folder stops working, the picker opens again.
export async function saveResultJson(
  run: InspectionRun,
  forcePick = false
): Promise<{ fileName: string; folder: string } | null> {
  if (Platform.OS !== 'android') {
    await shareResultJson(run); // no folder picker outside Android
    return null;
  }

  if (!forcePick) {
    const savedUri = await AsyncStorage.getItem(DOWNLOAD_DIR_KEY);
    if (savedUri) {
      try {
        return writeInto(new Directory(savedUri), run);
      } catch {
        await AsyncStorage.removeItem(DOWNLOAD_DIR_KEY); // permission lost: ask again below
      }
    }
  }

  const directory = await pickAndRememberDirectory();
  return writeInto(directory, run);
}

// SHARE: separate from download. Opens the share sheet (Drive, email,
// WhatsApp, ...) with the JSON file attached; nothing is stored permanently.
export async function shareResultJson(run: InspectionRun) {
  const file = new File(Paths.cache, buildFileName(run));
  file.create({ overwrite: true });
  file.write(JSON.stringify(run, null, 2));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Share inspection result',
    UTI: 'public.json',
  });
}