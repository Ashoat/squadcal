// @flow

import {
  createTooltip,
  tooltipHeight,
  type TooltipParams,
} from '../navigation/tooltip.react';
import RobotextMessageTooltipButton from './robotext-message-tooltip-button.react';
import type { ChatRobotextMessageInfoItemWithHeight } from './robotext-message.react';
import { navigateToSidebar } from './sidebar-navigation';

export type RobotextMessageTooltipModalParams = TooltipParams<{|
  +item: ChatRobotextMessageInfoItemWithHeight,
|}>;

const spec = {
  entries: [
    {
      id: 'create_sidebar',
      text: 'Create sidebar',
      onPress: navigateToSidebar,
    },
    {
      id: 'open_sidebar',
      text: 'Go to sidebar',
      onPress: navigateToSidebar,
    },
  ],
};

const RobotextMessageTooltipModal = createTooltip<
  'RobotextMessageTooltipModal',
>(RobotextMessageTooltipButton, spec);

const robotextMessageTooltipHeight = tooltipHeight(spec.entries.length);

export { RobotextMessageTooltipModal, robotextMessageTooltipHeight };
