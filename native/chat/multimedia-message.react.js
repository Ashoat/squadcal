// @flow

import invariant from 'invariant';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Media, Corners } from 'lib/types/media-types';
import type {
  MultimediaMessageInfo,
  LocalMessageInfo,
} from 'lib/types/message-types';
import type { ThreadInfo } from 'lib/types/thread-types';

import type { MessagePendingUploads } from '../input/input-state';
import type { NavigationRoute } from '../navigation/route-names';
import { type VerticalBounds } from '../types/layout-types';
import type { ViewStyle } from '../types/styles';
import type { ChatNavigationProp } from './chat.react';
import { ComposedMessage, clusterEndHeight } from './composed-message.react';
import { failedSendHeight } from './failed-send.react';
import {
  inlineSidebarHeight,
  inlineSidebarMarginBottom,
  inlineSidebarMarginTop,
} from './inline-sidebar.react';
import { authorNameHeight } from './message-header.react';
import MultimediaMessageMultimedia from './multimedia-message-multimedia.react';
import sendFailed from './multimedia-message-send-failed';
import {
  allCorners,
  filterCorners,
  getRoundedContainerStyle,
} from './rounded-corners';

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

function getMediaPerRow(mediaCount: number) {
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

const borderRadius = 16;

type Props = {|
  ...React.ElementConfig<typeof View>,
  +item: ChatMultimediaMessageInfoItem,
  +navigation: ChatNavigationProp<'MessageList'>,
  +route: NavigationRoute<'MessageList'>,
  +focused: boolean,
  +verticalBounds: ?VerticalBounds,
|};
class MultimediaMessage extends React.PureComponent<Props> {
  render() {
    const {
      item,
      navigation,
      route,
      focused,
      verticalBounds,
      ...viewProps
    } = this.props;
    const containerStyle = {
      height: item.contentHeight,
      width: item.contentWidth,
    };
    return (
      <ComposedMessage
        item={item}
        sendFailed={sendFailed(item)}
        focused={focused}
        {...viewProps}
      >
        <View style={containerStyle}>{this.renderContent()}</View>
      </ComposedMessage>
    );
  }

  renderContent(): React.Node {
    const { messageInfo } = this.props.item;
    invariant(messageInfo.media.length > 0, 'should have media');
    if (messageInfo.media.length === 1) {
      return this.renderImage(messageInfo.media[0], 0, allCorners);
    }

    const mediaPerRow = getMediaPerRow(messageInfo.media.length);

    const rows = [];
    for (let i = 0; i < messageInfo.media.length; i += mediaPerRow) {
      const rowMedia = messageInfo.media.slice(i, i + mediaPerRow);

      const firstRow = i === 0;
      const lastRow = i + mediaPerRow >= messageInfo.media.length;

      const row = [];
      let j = 0;
      for (; j < rowMedia.length; j++) {
        const media = rowMedia[j];
        const firstInRow = j === 0;
        const lastInRow = j + 1 === rowMedia.length;
        const inLastColumn = j + 1 === mediaPerRow;
        const corners = {
          topLeft: firstRow && firstInRow,
          topRight: firstRow && inLastColumn,
          bottomLeft: lastRow && firstInRow,
          bottomRight: lastRow && inLastColumn,
        };
        const style = lastInRow ? null : styles.imageBeforeImage;
        row.push(this.renderImage(media, i + j, corners, style));
      }
      for (; j < mediaPerRow; j++) {
        const key = `filler${j}`;
        const style =
          j + 1 < mediaPerRow
            ? [styles.filler, styles.imageBeforeImage]
            : styles.filler;
        row.push(<View style={style} key={key} />);
      }

      const rowStyle = lastRow ? styles.row : [styles.row, styles.rowAboveRow];
      rows.push(
        <View style={rowStyle} key={i}>
          {row}
        </View>,
      );
    }
    return <View style={styles.grid}>{rows}</View>;
  }

  renderImage(
    media: Media,
    index: number,
    corners: Corners,
    style?: ViewStyle,
  ): React.Node {
    const filteredCorners = filterCorners(corners, this.props.item);
    const roundedStyle = getRoundedContainerStyle(
      filteredCorners,
      borderRadius,
    );
    const { pendingUploads } = this.props.item;
    const mediaInfo = {
      ...media,
      corners: filteredCorners,
      index,
    };
    const pendingUpload = pendingUploads && pendingUploads[media.id];
    return (
      <MultimediaMessageMultimedia
        mediaInfo={mediaInfo}
        navigation={this.props.navigation}
        route={this.props.route}
        verticalBounds={this.props.verticalBounds}
        style={[style, roundedStyle]}
        postInProgress={!!pendingUploads}
        pendingUpload={pendingUpload}
        item={this.props.item}
        key={index}
      />
    );
  }
}

const spaceBetweenImages = 4;
const styles = StyleSheet.create({
  filler: {
    flex: 1,
  },
  grid: {
    flex: 1,
    justifyContent: 'space-between',
  },
  imageBeforeImage: {
    marginRight: spaceBetweenImages,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowAboveRow: {
    marginBottom: spaceBetweenImages,
  },
});

export {
  borderRadius as multimediaMessageBorderRadius,
  MultimediaMessage,
  multimediaMessageContentSizes,
  multimediaMessageItemHeight,
  sendFailed as multimediaMessageSendFailed,
};
