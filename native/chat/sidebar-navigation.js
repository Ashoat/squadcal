// @flow

import type { DispatchFunctions, ActionFunc } from 'lib/utils/action-utils';

import type { InputState } from '../input/input-state';
import type { AppNavigationProp } from '../navigation/app-navigator.react';
import { MessageListRouteName } from '../navigation/route-names';
import type { TooltipRoute } from '../navigation/tooltip.react';
import { getSidebarThreadInfo } from './utils';

function onPressGoToSidebar(
  route:
    | TooltipRoute<'RobotextMessageTooltipModal'>
    | TooltipRoute<'TextMessageTooltipModal'>
    | TooltipRoute<'MultimediaTooltipModal'>,
  dispatchFunctions: DispatchFunctions,
  bindServerCall: <F>(serverCall: ActionFunc<F>) => F,
  inputState: ?InputState,
  navigation:
    | AppNavigationProp<'RobotextMessageTooltipModal'>
    | AppNavigationProp<'TextMessageTooltipModal'>
    | AppNavigationProp<'MultimediaTooltipModal'>,
  viewerID: ?string,
) {
  let threadInfo;
  // Necessary for Flow...
  if (route.name === 'RobotextMessageTooltipModal') {
    threadInfo = getSidebarThreadInfo(route.params.item, viewerID);
  } else {
    threadInfo = getSidebarThreadInfo(route.params.item, viewerID);
  }

  navigation.navigate({
    name: MessageListRouteName,
    params: {
      threadInfo,
    },
    key: `${MessageListRouteName}${threadInfo.id}`,
  });
}

function onPressCreateSidebar(
  route:
    | TooltipRoute<'RobotextMessageTooltipModal'>
    | TooltipRoute<'TextMessageTooltipModal'>
    | TooltipRoute<'MultimediaTooltipModal'>,
  dispatchFunctions: DispatchFunctions,
  bindServerCall: <F>(serverCall: ActionFunc<F>) => F,
  inputState: ?InputState,
  navigation:
    | AppNavigationProp<'RobotextMessageTooltipModal'>
    | AppNavigationProp<'TextMessageTooltipModal'>
    | AppNavigationProp<'MultimediaTooltipModal'>,
  viewerID: ?string,
) {
  let threadInfo;
  // Necessary for Flow...
  if (route.name === 'RobotextMessageTooltipModal') {
    threadInfo = getSidebarThreadInfo(route.params.item, viewerID);
  } else {
    threadInfo = getSidebarThreadInfo(route.params.item, viewerID);
  }

  navigation.navigate({
    name: MessageListRouteName,
    params: {
      threadInfo,
    },
    key: `${MessageListRouteName}${threadInfo.id}`,
  });
}

export { onPressGoToSidebar, onPressCreateSidebar };
