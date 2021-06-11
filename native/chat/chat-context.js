// @flow

import * as React from 'react';

import type { ChatMessageItem } from 'lib/selectors/chat-selectors';
import type { ThreadInfo } from 'lib/types/thread-types';

import type { ChatMessageItemWithHeight } from './message-list-container.react';

export type MessagesMeasurer = (
  $ReadOnlyArray<ChatMessageItem>,
  ThreadInfo,
  ($ReadOnlyArray<ChatMessageItemWithHeight>) => mixed,
) => void;

export type ChatContextType = {|
  +registerMeasurer: () => {|
    +measure: MessagesMeasurer,
    +unregister: () => void,
  |},
|};
const ChatContext: React.Context<?ChatContextType> = React.createContext(null);

export { ChatContext };
