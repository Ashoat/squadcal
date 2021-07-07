// @flow

import {
  createTooltip,
  tooltipHeight,
  type TooltipParams,
} from '../navigation/tooltip.react';
import type { VerticalBounds } from '../types/layout-types';
import type { ChatMultimediaMessageInfoItem } from './multimedia-message-utils';
import MultimediaTooltipButton from './multimedia-tooltip-button.react';
import { navigateToSidebar } from './sidebar-navigation';

export type MultimediaTooltipModalParams = TooltipParams<{|
  +item: ChatMultimediaMessageInfoItem,
  +verticalBounds: VerticalBounds,
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

const MultimediaTooltipModal = createTooltip<'MultimediaTooltipModal'>(
  MultimediaTooltipButton,
  spec,
);

const multimediaTooltipHeight = tooltipHeight(spec.entries.length);

export { MultimediaTooltipModal, multimediaTooltipHeight };
