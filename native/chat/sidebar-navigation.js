// @flow

import invariant from 'invariant';

import { createPendingSidebar } from 'lib/shared/thread-utils';
import type {
  DispatchFunctions,
  ActionFunc,
  BoundServerCall,
} from 'lib/utils/action-utils';

import type { InputState } from '../input/input-state';
import type { AppNavigationProp } from '../navigation/app-navigator.react';
import { MessageListRouteName } from '../navigation/route-names';
import type { TooltipRoute } from '../navigation/tooltip.react';

function onPressGoToSidebar(
  route:
    | TooltipRoute<'RobotextMessageTooltipModal'>
    | TooltipRoute<'TextMessageTooltipModal'>
    | TooltipRoute<'MultimediaTooltipModal'>,
  dispatchFunctions: DispatchFunctions,
  bindServerCall: (serverCall: ActionFunc) => BoundServerCall,
  inputState: ?InputState,
  navigation:
    | AppNavigationProp<'RobotextMessageTooltipModal'>
    | AppNavigationProp<'TextMessageTooltipModal'>
    | AppNavigationProp<'MultimediaTooltipModal'>,
) {
  let threadCreatedFromMessage;
  // Necessary for Flow...
  if (route.name === 'RobotextMessageTooltipModal') {
    threadCreatedFromMessage = route.params.item.threadCreatedFromMessage;
  } else {
    threadCreatedFromMessage = route.params.item.threadCreatedFromMessage;
  }

  invariant(
    threadCreatedFromMessage,
    'threadCreatedFromMessage should be set in onPressGoToSidebar',
  );

  navigation.navigate({
    name: MessageListRouteName,
    params: {
      threadInfo: threadCreatedFromMessage,
    },
    key: `${MessageListRouteName}${threadCreatedFromMessage.id}`,
  });
}

function onPressCreateSidebar(
  route:
    | TooltipRoute<'RobotextMessageTooltipModal'>
    | TooltipRoute<'TextMessageTooltipModal'>
    | TooltipRoute<'MultimediaTooltipModal'>,
  dispatchFunctions: DispatchFunctions,
  bindServerCall: (serverCall: ActionFunc) => BoundServerCall,
  inputState: ?InputState,
  navigation:
    | AppNavigationProp<'RobotextMessageTooltipModal'>
    | AppNavigationProp<'TextMessageTooltipModal'>
    | AppNavigationProp<'MultimediaTooltipModal'>,
  viewerID: ?string,
) {
  invariant(
    viewerID,
    'viewerID should be set in TextMessageTooltipModal.onPressCreateSidebar',
  );
  let itemFromParams;
  // Necessary for Flow...
  if (route.name === 'RobotextMessageTooltipModal') {
    itemFromParams = route.params.item;
  } else {
    itemFromParams = route.params.item;
  }

  const { messageInfo, threadInfo } = itemFromParams;
  const pendingSidebarInfo = createPendingSidebar(
    messageInfo,
    threadInfo,
    viewerID,
  );
  const sourceMessageID = messageInfo.id;

  navigation.navigate({
    name: MessageListRouteName,
    params: {
      threadInfo: pendingSidebarInfo,
      sidebarSourceMessageID: sourceMessageID,
    },
    key: `${MessageListRouteName}${pendingSidebarInfo.id}`,
  });
}

export { onPressGoToSidebar, onPressCreateSidebar };