// @flow

import type { MediaInfo } from 'lib/types/media-types';

import { intentionalSaveMedia } from '../media/save-media';
import {
  createTooltip,
  tooltipHeight,
  type TooltipParams,
  type TooltipRoute,
} from '../navigation/tooltip.react';
import type { ChatMultimediaMessageInfoItem } from './multimedia-message.react';
import MultimediaTooltipButton from './multimedia-tooltip-button.react';
import { navigateToSidebar } from './sidebar-navigation';

export type MultimediaTooltipModalParams = TooltipParams<{|
  +item: ChatMultimediaMessageInfoItem,
  +mediaInfo: MediaInfo,
  +verticalOffset: number,
|}>;

function onPressSave(route: TooltipRoute<'MultimediaTooltipModal'>) {
  const { mediaInfo, item } = route.params;
  const { id: uploadID, uri } = mediaInfo;
  const { id: messageServerID, localID: messageLocalID } = item.messageInfo;
  const ids = { uploadID, messageServerID, messageLocalID };
  return intentionalSaveMedia(uri, ids);
}

const spec = {
  entries: [
    { id: 'save', text: 'Save', onPress: onPressSave },
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
