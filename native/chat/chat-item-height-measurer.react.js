// @flow

import invariant from 'invariant';
import * as React from 'react';

import type { ChatMessageItem } from 'lib/selectors/chat-selectors';
import { messageID } from 'lib/shared/message-utils';
import { messageTypes } from 'lib/types/message-types';

import NodeHeightMeasurer from '../components/node-height-measurer.react';
import { InputStateContext } from '../input/input-state';
import { useSelector } from '../redux/redux-utils';
import type { MeasurementTask } from './chat-context-provider.react';
import { chatMessageItemKey } from './chat-list.react';
import { composedMessageMaxWidthSelector } from './composed-message-width';
import { dummyNodeForRobotextMessageHeightMeasurement } from './inner-robotext-message.react';
import { dummyNodeForTextMessageHeightMeasurement } from './inner-text-message.react';
import { MessageListContextProvider } from './message-list-types';
import { multimediaMessageContentSizes } from './multimedia-message-utils';

type Props = {|
  +measurement: MeasurementTask,
|};

const heightMeasurerKey = (item: ChatMessageItem) => {
  if (item.itemType !== 'message') {
    return null;
  }
  const { messageInfo } = item;
  if (messageInfo.type === messageTypes.TEXT) {
    return messageInfo.text;
  } else if (item.robotext && typeof item.robotext === 'string') {
    return item.robotext;
  }
  return null;
};

const heightMeasurerDummy = (item: ChatMessageItem) => {
  invariant(
    item.itemType === 'message',
    'NodeHeightMeasurer asked for dummy for non-message item',
  );
  const { messageInfo } = item;
  if (messageInfo.type === messageTypes.TEXT) {
    return dummyNodeForTextMessageHeightMeasurement(messageInfo.text);
  } else if (item.robotext && typeof item.robotext === 'string') {
    return dummyNodeForRobotextMessageHeightMeasurement(item.robotext);
  }
  invariant(false, 'NodeHeightMeasurer asked for dummy for non-text message');
};

function ChatItemHeightMeasurer(props: Props) {
  const composedMessageMaxWidth = useSelector(composedMessageMaxWidthSelector);
  const inputState = React.useContext(InputStateContext);
  const inputStatePendingUploads = inputState?.pendingUploads;

  const { measurement } = props;
  const { threadInfo } = measurement;
  const heightMeasurerMergeItem = React.useCallback(
    (item: ChatMessageItem, height: ?number) => {
      if (item.itemType !== 'message') {
        return item;
      }

      const { messageInfo } = item;
      invariant(
        messageInfo.type !== messageTypes.SIDEBAR_SOURCE,
        'Sidebar source messages should be replaced by sourceMessage before being measured',
      );

      if (
        messageInfo.type === messageTypes.IMAGES ||
        messageInfo.type === messageTypes.MULTIMEDIA
      ) {
        // Conditional due to Flow...
        const localMessageInfo = item.localMessageInfo
          ? item.localMessageInfo
          : null;
        const id = messageID(messageInfo);
        const pendingUploads = inputStatePendingUploads?.[id];
        const sizes = multimediaMessageContentSizes(
          messageInfo,
          composedMessageMaxWidth,
        );
        return {
          itemType: 'message',
          messageShapeType: 'multimedia',
          messageInfo,
          localMessageInfo,
          threadInfo,
          startsConversation: item.startsConversation,
          startsCluster: item.startsCluster,
          endsCluster: item.endsCluster,
          threadCreatedFromMessage: item.threadCreatedFromMessage,
          pendingUploads,
          ...sizes,
        };
      }

      invariant(
        height !== null && height !== undefined,
        'height should be set',
      );
      if (messageInfo.type === messageTypes.TEXT) {
        // Conditional due to Flow...
        const localMessageInfo = item.localMessageInfo
          ? item.localMessageInfo
          : null;
        return {
          itemType: 'message',
          messageShapeType: 'text',
          messageInfo,
          localMessageInfo,
          threadInfo,
          startsConversation: item.startsConversation,
          startsCluster: item.startsCluster,
          endsCluster: item.endsCluster,
          threadCreatedFromMessage: item.threadCreatedFromMessage,
          contentHeight: height,
        };
      } else {
        invariant(
          typeof item.robotext === 'string',
          "Flow can't handle our fancy types :(",
        );
        return {
          itemType: 'message',
          messageShapeType: 'robotext',
          messageInfo,
          threadInfo,
          startsConversation: item.startsConversation,
          startsCluster: item.startsCluster,
          endsCluster: item.endsCluster,
          threadCreatedFromMessage: item.threadCreatedFromMessage,
          robotext: item.robotext,
          contentHeight: height,
        };
      }
    },
    [composedMessageMaxWidth, inputStatePendingUploads, threadInfo],
  );

  return (
    <MessageListContextProvider
      threadID={threadInfo.id}
      key={measurement.measurerID}
    >
      <NodeHeightMeasurer
        listData={measurement.messages}
        itemToID={chatMessageItemKey}
        itemToMeasureKey={heightMeasurerKey}
        itemToDummy={heightMeasurerDummy}
        mergeItemWithHeight={heightMeasurerMergeItem}
        allHeightsMeasured={measurement.onMessagesMeasured}
        inputState={inputState}
        composedMessageMaxWidth={composedMessageMaxWidth}
        initialMeasuredHeights={measurement.initialMeasuredHeights}
      />
    </MessageListContextProvider>
  );
}

export default React.memo<Props>(ChatItemHeightMeasurer);
