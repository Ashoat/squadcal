// @flow

import Clipboard from '@react-native-community/clipboard';
import invariant from 'invariant';

import { createMessageReply } from 'lib/shared/message-utils';
import type { DispatchFunctions, ActionFunc } from 'lib/utils/action-utils';

import type { InputState } from '../input/input-state';
import { displayActionResultModal } from '../navigation/action-result-modal';
import {
  createTooltip,
  tooltipHeight,
  type TooltipParams,
  type TooltipRoute,
} from '../navigation/tooltip.react';
import { navigateToSidebar } from './sidebar-navigation';
import TextMessageTooltipButton from './text-message-tooltip-button.react';
import type { ChatTextMessageInfoItemWithHeight } from './text-message.react';

export type TextMessageTooltipModalParams = TooltipParams<{|
  +item: ChatTextMessageInfoItemWithHeight,
|}>;

const confirmCopy = () => displayActionResultModal('copied!');

function onPressCopy(route: TooltipRoute<'TextMessageTooltipModal'>) {
  Clipboard.setString(route.params.item.messageInfo.text);
  setTimeout(confirmCopy);
}

function onPressReply(
  route: TooltipRoute<'TextMessageTooltipModal'>,
  dispatchFunctions: DispatchFunctions,
  bindServerCall: <F>(serverCall: ActionFunc<F>) => F,
  inputState: ?InputState,
) {
  invariant(
    inputState,
    'inputState should be set in TextMessageTooltipModal.onPressReply',
  );
  inputState.addReply(createMessageReply(route.params.item.messageInfo.text));
}

const spec = {
  entries: [
    { id: 'copy', text: 'Copy', onPress: onPressCopy },
    { id: 'reply', text: 'Reply', onPress: onPressReply },
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

const TextMessageTooltipModal = createTooltip<'TextMessageTooltipModal'>(
  TextMessageTooltipButton,
  spec,
);

const textMessageTooltipHeight = tooltipHeight(spec.entries.length);

export { TextMessageTooltipModal, textMessageTooltipHeight };
