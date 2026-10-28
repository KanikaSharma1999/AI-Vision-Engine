import type { InspectionRun } from './api';

// Tiny in-memory hand-off between the Main screen and the Results screen.
// Route params get stringified, so a whole run record is kept here instead.
let lastRun: InspectionRun | null = null;
let lastImageUri: string | null = null;
let resetRequested = false;

export function setLastRun(run: InspectionRun, imageUri: string | null) {
  lastRun = run;
  lastImageUri = imageUri;
}

export function getLastRun() {
  return { run: lastRun, imageUri: lastImageUri };
}

export function clearLastRun() {
  lastRun = null;
  lastImageUri = null;
}

// "New inspection" on the Results screen asks the Main screen to clear its form.
export function requestFormReset() {
  resetRequested = true;
}

export function consumeFormReset() {
  const value = resetRequested;
  resetRequested = false;
  return value;
}
