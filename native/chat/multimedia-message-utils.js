// @flow

import invariant from 'invariant';

import { messageKey } from 'lib/shared/message-utils';
import type { MediaInfo } from 'lib/types/media-types';
import type {
  LocalMessageInfo,
  MultimediaMessageInfo,
} from 'lib/types/message-types';
import type { ThreadInfo } from 'lib/types/thread-types';

import type { MessagePendingUploads } from '../input/input-state';
import { clusterEndHeight } from './composed-message.react';
import { failedSendHeight } from './failed-send.react';
import {
  inlineSidebarHeight,
  inlineSidebarMarginBottom,
  inlineSidebarMarginTop,
} from './inline-sidebar.react';
import { authorNameHeight } from './message-header.react';

type ContentSizes = {|
  +imageHeight: number,
  +contentHeight: number,
  +contentWidth: number,
|};
export type ChatMultimediaMessageInfoItem = {|
  ...ContentSizes,
  +itemType: 'message',
  +messageShapeType: 'multimedia',
  +messageInfo: MultimediaMessageInfo,
  +localMessageInfo: ?LocalMessageInfo,
  +threadInfo: ThreadInfo,
  +startsConversation: boolean,
  +startsCluster: boolean,
  +endsCluster: boolean,
  +threadCreatedFromMessage: ?ThreadInfo,
  +pendingUploads: ?MessagePendingUploads,
|};

const spaceBetweenImages = 4;

function getMediaPerRow(mediaCount: number): number {
  if (mediaCount === 0) {
    return 0; // ???
  } else if (mediaCount === 1) {
    return 1;
  } else if (mediaCount === 2) {
    return 2;
  } else if (mediaCount === 3) {
    return 3;
  } else if (mediaCount === 4) {
    return 2;
  } else {
    return 3;
  }
}

function multimediaMessageSendFailed(
  item: ChatMultimediaMessageInfoItem,
): boolean {
  const { messageInfo, localMessageInfo, pendingUploads } = item;
  const { id: serverID } = messageInfo;
  if (serverID !== null && serverID !== undefined) {
    return false;
  }

  const { isViewer } = messageInfo.creator;
  if (!isViewer) {
    return false;
  }

  if (localMessageInfo && localMessageInfo.sendFailed) {
    return true;
  }

  for (const media of messageInfo.media) {
    const pendingUpload = pendingUploads && pendingUploads[media.id];
    if (pendingUpload && pendingUpload.failed) {
      return true;
    }
  }

  return !pendingUploads;
}

// The results are merged into ChatMultimediaMessageInfoItem
function multimediaMessageContentSizes(
  messageInfo: MultimediaMessageInfo,
  composedMessageMaxWidth: number,
): ContentSizes {
  invariant(messageInfo.media.length > 0, 'should have media');

  if (messageInfo.media.length === 1) {
    const [media] = messageInfo.media;
    const { height, width } = media.dimensions;

    let imageHeight = height;
    if (width > composedMessageMaxWidth) {
      imageHeight = (height * composedMessageMaxWidth) / width;
    }
    if (imageHeight < 50) {
      imageHeight = 50;
    }

    let contentWidth = height ? (width * imageHeight) / height : 0;
    if (contentWidth > composedMessageMaxWidth) {
      contentWidth = composedMessageMaxWidth;
    }

    return { imageHeight, contentHeight: imageHeight, contentWidth };
  }

  const contentWidth = composedMessageMaxWidth;

  const mediaPerRow = getMediaPerRow(messageInfo.media.length);
  const marginSpace = spaceBetweenImages * (mediaPerRow - 1);
  const imageHeight = (contentWidth - marginSpace) / mediaPerRow;

  const numRows = Math.ceil(messageInfo.media.length / mediaPerRow);
  const contentHeight =
    numRows * imageHeight + (numRows - 1) * spaceBetweenImages;

  return { imageHeight, contentHeight, contentWidth };
}

// Given a ChatMultimediaMessageInfoItem, determines exact height of row
function multimediaMessageItemHeight(
  item: ChatMultimediaMessageInfoItem,
): number {
  const { messageInfo, contentHeight, startsCluster, endsCluster } = item;
  const { creator } = messageInfo;
  const { isViewer } = creator;
  let height = 5 + contentHeight; // 5 from marginBottom in ComposedMessage
  if (!isViewer && startsCluster) {
    height += authorNameHeight;
  }
  if (endsCluster) {
    height += clusterEndHeight;
  }
  if (multimediaMessageSendFailed(item)) {
    height += failedSendHeight;
  }
  if (item.threadCreatedFromMessage) {
    height +=
      inlineSidebarHeight + inlineSidebarMarginTop + inlineSidebarMarginBottom;
  }
  return height;
}

function getMediaKey(
  item: ChatMultimediaMessageInfoItem,
  mediaInfo: MediaInfo,
): string {
  return `multimedia|${messageKey(item.messageInfo)}|${mediaInfo.index}`;
}

export {
  multimediaMessageContentSizes,
  multimediaMessageItemHeight,
  multimediaMessageSendFailed,
  getMediaPerRow,
  spaceBetweenImages,
  getMediaKey,
};
