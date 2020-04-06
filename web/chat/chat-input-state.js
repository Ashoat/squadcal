// @flow

import {
  type MediaType,
  mediaTypePropType,
  type Dimensions,
  dimensionsPropType,
} from 'lib/types/media-types';
import type { RawTextMessageInfo } from 'lib/types/message-types';

import PropTypes from 'prop-types';

export type PendingMultimediaUpload = {|
  localID: string,
  // Pending uploads are assigned a serverID once they are complete
  serverID: ?string,
  // Pending uploads are assigned a messageID once they are sent
  messageID: ?string,
  // This is set to truthy if the upload fails for whatever reason
  failed: ?string,
  file: File,
  mediaType: MediaType,
  dimensions: Dimensions,
  uri: string,
  // URLs created with createObjectURL aren't considered "real". The distinction
  // is required because those "fake" URLs must be disposed properly
  uriIsReal: boolean,
  progressPercent: number,
  // This is set once the network request begins and used if the upload is
  // cancelled
  abort: ?() => void,
|};
export const pendingMultimediaUploadPropType = PropTypes.shape({
  localID: PropTypes.string.isRequired,
  serverID: PropTypes.string,
  messageID: PropTypes.string,
  failed: PropTypes.string,
  file: PropTypes.object.isRequired,
  mediaType: mediaTypePropType.isRequired,
  dimensions: dimensionsPropType.isRequired,
  uri: PropTypes.string.isRequired,
  uriIsReal: PropTypes.bool.isRequired,
  progressPercent: PropTypes.number.isRequired,
  abort: PropTypes.func,
});

// This type represents the input state for a particular thread
export type ChatInputState = {|
  pendingUploads: $ReadOnlyArray<PendingMultimediaUpload>,
  assignedUploads: {
    [messageID: string]: $ReadOnlyArray<PendingMultimediaUpload>,
  },
  draft: string,
  appendFiles: (files: $ReadOnlyArray<File>) => Promise<void>,
  cancelPendingUpload: (localUploadID: string) => void,
  sendTextMessage: (messageInfo: RawTextMessageInfo) => void,
  createMultimediaMessage: (localID?: number) => void,
  setDraft: (draft: string) => void,
  messageHasUploadFailure: (localMessageID: string) => boolean,
  retryMultimediaMessage: (localMessageID: string) => void,
|};
const arrayOfUploadsPropType = PropTypes.arrayOf(
  pendingMultimediaUploadPropType,
);
export const chatInputStatePropType = PropTypes.shape({
  pendingUploads: arrayOfUploadsPropType.isRequired,
  assignedUploads: PropTypes.objectOf(arrayOfUploadsPropType).isRequired,
  draft: PropTypes.string.isRequired,
  appendFiles: PropTypes.func.isRequired,
  cancelPendingUpload: PropTypes.func.isRequired,
  sendTextMessage: PropTypes.func.isRequired,
  createMultimediaMessage: PropTypes.func.isRequired,
  setDraft: PropTypes.func.isRequired,
  messageHasUploadFailure: PropTypes.func.isRequired,
  retryMultimediaMessage: PropTypes.func.isRequired,
});
