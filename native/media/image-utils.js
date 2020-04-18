// @flow

import type {
  Dimensions,
  MediaMissionStep,
  MediaMissionFailure,
} from 'lib/types/media-types';

import * as ImageManipulator from 'expo-image-manipulator';

import { getImageProcessingPlan } from 'lib/utils/image-utils';

type ProcessImageInfo = {|
  uri: string,
  dimensions: Dimensions,
  mime: string,
  fileSize: number,
  orientation: ?number,
|};
type ProcessImageResponse = {|
  success: true,
  uri: string,
  mime: string,
  dimensions: Dimensions,
|};
async function processImage(
  input: ProcessImageInfo,
): Promise<{|
  steps: $ReadOnlyArray<MediaMissionStep>,
  result: MediaMissionFailure | ProcessImageResponse,
|}> {
  const steps = [];
  let { uri, dimensions, mime } = input;

  const { fileSize, orientation } = input;
  const plan = getImageProcessingPlan(mime, dimensions, fileSize, orientation);
  if (!plan) {
    return {
      steps,
      result: { success: true, uri, dimensions, mime },
    };
  }
  const { targetMIME, compressionRatio, fitInside } = plan;

  const transforms = [];
  if (fitInside) {
    const fitInsideRatio = fitInside.width / fitInside.height;
    if (dimensions.width / dimensions.height > fitInsideRatio) {
      transforms.push({ width: fitInside.width });
    } else {
      transforms.push({ height: fitInside.height });
    }
  }

  const format =
    targetMIME === 'image/png'
      ? ImageManipulator.SaveFormat.PNG
      : ImageManipulator.SaveFormat.JPEG;
  const saveConfig = { format, compress: compressionRatio };

  let success = false,
    exceptionMessage;
  const start = Date.now();
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      transforms,
      saveConfig,
    );
    success = true;
    uri = result.uri;
    mime = targetMIME;
    dimensions = { width: result.width, height: result.height };
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
    step: 'photo_manipulation',
    manipulation: { transforms, saveConfig },
    success,
    exceptionMessage,
    time: Date.now() - start,
    newMIME: success ? mime : null,
    newDimensions: success ? dimensions : null,
    newURI: success ? uri : null,
  });

  if (!success) {
    return {
      steps,
      result: {
        success: false,
        reason: 'photo_manipulation_failed',
        size: fileSize,
      },
    };
  }

  return { steps, result: { success: true, uri, dimensions, mime } };
}

export { processImage };