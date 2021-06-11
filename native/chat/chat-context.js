// @flow

import invariant from 'invariant';
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

function useHeightMeasurer(): MessagesMeasurer {
  const chatContext = React.useContext(ChatContext);
  invariant(chatContext, 'Chat context should be set');

  const measureRegistrationRef = React.useRef();
  if (!measureRegistrationRef.current) {
    measureRegistrationRef.current = chatContext.registerMeasurer();
  }
  const measureRegistration = measureRegistrationRef.current;
  React.useEffect(() => {
    return measureRegistration.unregister;
  }, [measureRegistration]);
  return measureRegistration.measure;
}

export { ChatContext, useHeightMeasurer };
