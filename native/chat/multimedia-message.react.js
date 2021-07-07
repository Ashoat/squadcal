// @flow

import type {
  LeafRoute,
  NavigationProp,
  ParamListBase,
} from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import invariant from 'invariant';
import * as React from 'react';
import { View } from 'react-native';

import type {
  MultimediaMessageInfo,
  LocalMessageInfo,
} from 'lib/types/message-types';
import type { ThreadInfo } from 'lib/types/thread-types';

import type { MessagePendingUploads } from '../input/input-state';
import { type VerticalBounds } from '../types/layout-types';
import { ComposedMessage, clusterEndHeight } from './composed-message.react';
import { failedSendHeight } from './failed-send.react';
import {
  inlineSidebarHeight,
  inlineSidebarMarginBottom,
  inlineSidebarMarginTop,
} from './inline-sidebar.react';
import {
  getMediaPerRow,
  InnerMultimediaMessage,
  spaceBetweenImages,
} from './inner-multimedia-message.react';
import { authorNameHeight } from './message-header.react';
import sendFailed from './multimedia-message-send-failed';

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

// Called by MessageListContainer
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

// Called by Message
// Given a ChatMultimediaMessageInfoItem, determines exact height of row
function multimediaMessageItemHeight(item: ChatMultimediaMessageInfoItem) {
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
  if (sendFailed(item)) {
    height += failedSendHeight;
  }
  if (item.threadCreatedFromMessage) {
    height +=
      inlineSidebarHeight + inlineSidebarMarginTop + inlineSidebarMarginBottom;
  }
  return height;
}

type BaseProps = {|
  ...React.ElementConfig<typeof View>,
  +item: ChatMultimediaMessageInfoItem,
  +focused: boolean,
  +verticalBounds: ?VerticalBounds,
|};
type Props = {|
  ...BaseProps,
  +navigation: NavigationProp<ParamListBase>,
  +route: LeafRoute<>,
|};
class MultimediaMessage extends React.PureComponent<Props> {
  render() {
    const {
      item,
      focused,
      verticalBounds,
      navigation,
      route,
      ...viewProps
    } = this.props;
    return (
      <ComposedMessage
        item={item}
        sendFailed={sendFailed(item)}
        focused={focused}
        {...viewProps}
      >
        <InnerMultimediaMessage item={item} verticalBounds={verticalBounds} />
      </ComposedMessage>
    );
  }
}

const MultimediaMessageComponent: React.ComponentType<BaseProps> = React.memo<BaseProps>(
  function ConnectedMultimediaMessage(props: BaseProps) {
    const navigation = useNavigation();
    const route = useRoute();
    return (
      <MultimediaMessage {...props} navigation={navigation} route={route} />
    );
  },
);

export {
  MultimediaMessageComponent as MultimediaMessage,
  multimediaMessageContentSizes,
  multimediaMessageItemHeight,
  sendFailed as multimediaMessageSendFailed,
};
