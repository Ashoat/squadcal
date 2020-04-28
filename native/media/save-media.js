// @flow

import type {
  MediaMissionStep,
  MediaMissionResult,
  MediaMission,
  MediaMissionFailure,
} from 'lib/types/media-types';

import { Platform, PermissionsAndroid } from 'react-native';
import filesystem from 'react-native-fs';
import * as MediaLibrary from 'expo-media-library';

import { readableFilename, pathFromURI } from 'lib/utils/file-utils';
import { promiseAll } from 'lib/utils/promises';

import { fetchBlob } from './blob-utils';
import { getMediaLibraryIdentifier } from './identifier-utils';
import {
  fetchAssetInfo,
  fetchFileInfo,
  disposeTempFile,
  mkdir,
  androidScanFile,
  fetchFileHash,
  copyFile,
} from './file-utils';
import { displayActionResultModal } from '../navigation/action-result-modal';
import { getAndroidPermission } from '../utils/android-permissions';

async function intentionalSaveMedia(uri: string): Promise<MediaMission> {
  const start = Date.now();
  const { resultPromise, reportPromise } = saveMedia(uri, 'request');
  const result = await resultPromise;
  const userTime = Date.now() - start;

  let message;
  if (result.success) {
    message = 'saved!';
  } else if (result.reason === 'save_unsupported') {
    const os = Platform.select({
      ios: 'iOS',
      android: 'Android',
      default: Platform.OS,
    });
    message = `saving media is unsupported on ${os}`;
  } else if (result.reason === 'missing_permission') {
    message = "don't have permission :(";
  } else if (
    result.reason === 'resolve_failed' ||
    result.reason === 'data_uri_failed'
  ) {
    message = 'failed to resolve :(';
  } else if (result.reason === 'fetch_failed') {
    message = 'failed to download :(';
  } else {
    message = 'failed to save :(';
  }
  displayActionResultModal(message);

  const steps = await reportPromise;
  const totalTime = Date.now() - start;
  return { steps, result, userTime, totalTime };
}

type Permissions = 'check' | 'request';

function saveMedia(
  uri: string,
  permissions?: Permissions = 'check',
): {|
  resultPromise: Promise<MediaMissionResult>,
  reportPromise: Promise<$ReadOnlyArray<MediaMissionStep>>,
|} {
  let resolveResult;
  const sendResult = result => {
    if (resolveResult) {
      resolveResult(result);
    }
  };

  const reportPromise = innerSaveMedia(uri, permissions, sendResult);
  const resultPromise = new Promise(resolve => {
    resolveResult = resolve;
  });

  return { reportPromise, resultPromise };
}

async function innerSaveMedia(
  uri: string,
  permissions: Permissions,
  sendResult: (result: MediaMissionResult) => void,
): Promise<$ReadOnlyArray<MediaMissionStep>> {
  if (Platform.OS === 'android') {
    return await saveMediaAndroid(uri, permissions, sendResult);
  } else if (Platform.OS === 'ios') {
    return await saveMediaIOS(uri, sendResult);
  } else {
    sendResult({ success: false, reason: 'save_unsupported' });
    return [];
  }
}

const androidSavePermission =
  PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;

// On Android, we save the media to our own SquadCal folder in the
// Pictures directory, and then trigger the media scanner to pick it up
async function saveMediaAndroid(
  inputURI: string,
  permissions: Permissions,
  sendResult: (result: MediaMissionResult) => void,
): Promise<$ReadOnlyArray<MediaMissionStep>> {
  const steps = [];

  let hasPermission = false,
    permissionCheckExceptionMessage;
  const permissionCheckStart = Date.now();
  try {
    if (permissions === 'check') {
      hasPermission = await PermissionsAndroid.check(androidSavePermission);
    } else {
      hasPermission = await getAndroidPermission(androidSavePermission, {
        title: 'Save Photo',
        message: 'Requesting access to your external storage',
      });
    }
  } catch (e) {
    if (
      e &&
      typeof e === 'object' &&
      e.message &&
      typeof e.message === 'string'
    ) {
      permissionCheckExceptionMessage = e.message;
    }
  }
  steps.push({
    step: 'permissions_check',
    success: hasPermission,
    exceptionMessage: permissionCheckExceptionMessage,
    time: Date.now() - permissionCheckStart,
    platform: Platform.OS,
    permissions: [androidSavePermission],
  });
  if (!hasPermission) {
    sendResult({ success: false, reason: 'missing_permission' });
    return steps;
  }

  const promises = [];
  let success = true;
  const saveFolder = `${filesystem.PicturesDirectoryPath}/SquadCal/`;
  promises.push(
    (async () => {
      const makeDirectoryStep = await mkdir(saveFolder);
      if (!makeDirectoryStep.success) {
        success = false;
        sendResult({ success, reason: 'make_directory_failed' });
      }
      steps.push(makeDirectoryStep);
    })(),
  );

  let uri = inputURI;
  let tempFile, mime;
  if (uri.startsWith('http')) {
    promises.push(
      (async () => {
        const {
          result: tempSaveResult,
          steps: tempSaveSteps,
        } = await saveRemoteMediaToDisk(
          uri,
          `${filesystem.TemporaryDirectoryPath}/`,
        );
        steps.push(...tempSaveSteps);
        if (!tempSaveResult.success) {
          success = false;
          sendResult(tempSaveResult);
        } else {
          tempFile = tempSaveResult.path;
          uri = `file://${tempFile}`;
          mime = tempSaveResult.mime;
        }
      })(),
    );
  }

  await Promise.all(promises);
  if (!success) {
    return steps;
  }

  const { result: copyResult, steps: copySteps } = await copyToSortedDirectory(
    uri,
    saveFolder,
    mime,
  );
  steps.push(...copySteps);
  if (!copyResult.success) {
    sendResult(copyResult);
    return steps;
  }
  sendResult({ success: true });

  const postResultPromises = [];

  postResultPromises.push(
    (async () => {
      const scanFileStep = await androidScanFile(copyResult.path);
      steps.push(scanFileStep);
    })(),
  );

  if (tempFile) {
    postResultPromises.push(
      (async (file: string) => {
        const disposeStep = await disposeTempFile(file);
        steps.push(disposeStep);
      })(tempFile),
    );
  }

  await Promise.all(postResultPromises);
  return steps;
}

// On iOS, we save the media to the camera roll
async function saveMediaIOS(
  inputURI: string,
  sendResult: (result: MediaMissionResult) => void,
): Promise<$ReadOnlyArray<MediaMissionStep>> {
  const steps = [];

  let uri = inputURI;
  let tempFile;
  if (uri.startsWith('http')) {
    const {
      result: tempSaveResult,
      steps: tempSaveSteps,
    } = await saveRemoteMediaToDisk(uri, filesystem.TemporaryDirectoryPath);
    steps.push(...tempSaveSteps);
    if (!tempSaveResult.success) {
      sendResult(tempSaveResult);
      return steps;
    }
    tempFile = tempSaveResult.path;
    uri = `file://${tempFile}`;
  } else if (!uri.startsWith('file://')) {
    const mediaNativeID = getMediaLibraryIdentifier(uri);
    if (mediaNativeID) {
      const {
        result: fetchAssetInfoResult,
        steps: fetchAssetInfoSteps,
      } = await fetchAssetInfo(mediaNativeID);
      steps.push(...fetchAssetInfoSteps);
      const { localURI } = fetchAssetInfoResult;
      if (localURI) {
        uri = localURI;
      }
    }
  }

  if (!uri.startsWith('file://')) {
    sendResult({ success: false, reason: 'resolve_failed', uri });
    return steps;
  }

  let success = false,
    exceptionMessage;
  const start = Date.now();
  try {
    await MediaLibrary.saveToLibraryAsync(uri);
    success = true;
  } catch (e) {
    if (
      e &&
      typeof e === 'object' &&
      e.message &&
      typeof e.message === 'string'
    ) {
      exceptionMessage = e.message;
    }
  }
  steps.push({
    step: 'ios_save_to_library',
    success,
    exceptionMessage,
    time: Date.now() - start,
    uri,
  });

  if (success) {
    sendResult({ success: true });
  } else {
    sendResult({ success: false, reason: 'save_to_library_failed', uri });
  }

  if (tempFile) {
    const disposeStep = await disposeTempFile(tempFile);
    steps.push(disposeStep);
  }
  return steps;
}

type IntermediateSaveResult = {|
  result: {| success: true, path: string, mime: string |} | MediaMissionFailure,
  steps: $ReadOnlyArray<MediaMissionStep>,
|};

async function saveRemoteMediaToDisk(
  inputURI: string,
  directory: string, // should end with a /
): Promise<IntermediateSaveResult> {
  const steps = [];

  const { result: fetchBlobResult, steps: fetchBlobSteps } = await fetchBlob(
    inputURI,
  );
  steps.push(...fetchBlobSteps);
  if (!fetchBlobResult.success) {
    return { result: fetchBlobResult, steps };
  }
  const { mime, base64 } = fetchBlobResult;

  const tempName = readableFilename('', mime);
  if (!tempName) {
    return {
      result: { success: false, reason: 'mime_check_failed', mime },
      steps,
    };
  }
  const tempPath = `${directory}tempsave.${tempName}`;

  const start = Date.now();
  let success = false,
    exceptionMessage;
  try {
    await filesystem.writeFile(tempPath, base64, 'base64');
    success = true;
  } catch (e) {
    if (
      e &&
      typeof e === 'object' &&
      e.message &&
      typeof e.message === 'string'
    ) {
      exceptionMessage = e.message;
    }
  }
  steps.push({
    step: 'write_file',
    success,
    exceptionMessage,
    time: Date.now() - start,
    path: tempPath,
    length: base64.length,
  });

  if (!success) {
    return { result: { success: false, reason: 'write_file_failed' }, steps };
  }
  return { result: { success: true, path: tempPath, mime }, steps };
}

async function copyToSortedDirectory(
  localURI: string,
  directory: string, // should end with a /
  inputMIME: ?string,
): Promise<IntermediateSaveResult> {
  const steps = [];

  const path = pathFromURI(localURI);
  if (!path) {
    return {
      result: { success: false, reason: 'resolve_failed', uri: localURI },
      steps,
    };
  }
  let mime = inputMIME;

  const promises = {};
  promises.hashStep = fetchFileHash(path);
  if (!mime) {
    promises.fileInfoResult = fetchFileInfo(localURI, undefined, {
      mime: true,
    });
  }
  const { hashStep, fileInfoResult } = await promiseAll(promises);

  steps.push(hashStep);
  if (!hashStep.success) {
    return {
      result: { success: false, reason: 'fetch_file_hash_failed' },
      steps,
    };
  }

  if (fileInfoResult) {
    steps.push(...fileInfoResult.steps);
    if (fileInfoResult.result.success && fileInfoResult.result.mime) {
      ({ mime } = fileInfoResult.result);
    }
  }
  if (!mime) {
    return {
      result: { success: false, reason: 'mime_check_failed', mime },
      steps,
    };
  }

  const name = readableFilename(hashStep.hash, mime);
  if (!name) {
    return {
      result: { success: false, reason: 'mime_check_failed', mime },
      steps,
    };
  }
  const newPath = `${directory}${name}`;

  const copyStep = await copyFile(path, newPath);
  steps.push(copyStep);
  if (!copyStep.success) {
    return {
      result: { success: false, reason: 'copy_file_failed' },
      steps,
    };
  }

  return {
    result: { success: true, path: newPath, mime },
    steps,
  };
}

export { intentionalSaveMedia, saveMedia };