// @flow

import invariant from 'invariant';
import * as React from 'react';

import { useMessageListData } from 'lib/selectors/chat-selectors';
import { createPendingSidebar } from 'lib/shared/thread-utils';
import type { ThreadInfo } from 'lib/types/thread-types';

import { getDefaultTextMessageRules } from '../markdown/rules.react';
import { useSelector } from '../redux/redux-utils';
import type { LayoutCoordinates, VerticalBounds } from '../types/layout-types';
import { useHeightMeasurer } from './chat-context';
import { chatMessageItemHeight } from './chat-list.react';
import type { ChatMessageItemWithHeight } from './message-list-container.react';
import type { ChatMessageInfoItemWithHeight } from './message.react';
import { timestampHeight } from './timestamp.react';

function getSidebarThreadInfo(
  sourceMessage: ChatMessageInfoItemWithHeight,
  viewerID?: ?string,
): ThreadInfo {
  const threadCreatedFromMessage = sourceMessage.threadCreatedFromMessage;
  if (threadCreatedFromMessage) {
    return threadCreatedFromMessage;
  }

  invariant(viewerID, 'viewerID should be set');

  const { messageInfo, threadInfo } = sourceMessage;
  return createPendingSidebar(
    messageInfo,
    threadInfo,
    viewerID,
    getDefaultTextMessageRules().simpleMarkdownRules,
  );
}

function useMessageTargetPosition(
  sourceMessage: ChatMessageInfoItemWithHeight,
  initialCoordinates: LayoutCoordinates,
  messageListVerticalBounds: VerticalBounds,
): number {
  const viewerID = useSelector(
    (state) => state.currentUserInfo && state.currentUserInfo.id,
  );
  const sidebarThreadInfo = React.useMemo(() => {
    return getSidebarThreadInfo(sourceMessage, viewerID);
  }, [sourceMessage, viewerID]);

  const messageListData = useMessageListData({
    searching: false,
    userInfoInputArray: [],
    threadInfo: sidebarThreadInfo,
  });

  const [
    messagesWithHeight,
    setMessagesWithHeight,
  ] = React.useState<?$ReadOnlyArray<ChatMessageItemWithHeight>>(null);
  const measureMessages = useHeightMeasurer();

  React.useEffect(() => {
    if (messageListData) {
      measureMessages(
        messageListData,
        sidebarThreadInfo,
        setMessagesWithHeight,
      );
    }
  }, [measureMessages, messageListData, sidebarThreadInfo]);

  const sourceMessageID = sourceMessage.messageInfo?.id;
  const targetDistanceFromBottom = React.useMemo(() => {
    if (!messagesWithHeight) {
      return 0;
    }

    let offset = 0;
    for (const message of messagesWithHeight) {
      offset += chatMessageItemHeight(message);
      if (message.messageInfo && message.messageInfo.id === sourceMessageID) {
        return offset;
      }
    }

    return (
      messageListVerticalBounds.height + chatMessageItemHeight(sourceMessage)
    );
  }, [
    messageListVerticalBounds.height,
    messagesWithHeight,
    sourceMessage,
    sourceMessageID,
  ]);

  const currentDistanceFromBottom =
    messageListVerticalBounds.height +
    messageListVerticalBounds.y -
    initialCoordinates.y +
    timestampHeight;
  return targetDistanceFromBottom - currentDistanceFromBottom;
}

export { getSidebarThreadInfo, useMessageTargetPosition };
