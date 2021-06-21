// @flow

import * as React from 'react';

import type { ChatMessageItem } from 'lib/selectors/chat-selectors';
import type { ThreadInfo } from 'lib/types/thread-types';

import { ChatContext } from './chat-context';
import type { ChatMessageItemWithHeight } from './message-list-container.react';

type BaseProps = {|
  +children: React.Node,
|};
type Props = {|
  ...BaseProps,
|};

export type MeasurementTask = {|
  +messages: $ReadOnlyArray<ChatMessageItem>,
  +threadInfo: ThreadInfo,
  +onMessagesMeasured: (
    messagesWithHeight: $ReadOnlyArray<ChatMessageItemWithHeight>,
  ) => mixed,
  +measurerID: number,
|};

class ChatContextProvider extends React.PureComponent<Props> {
  registerMeasurer = () => ({
    measure: (
      // eslint-disable-next-line no-unused-vars
      messages: $ReadOnlyArray<ChatMessageItem>,
      // eslint-disable-next-line no-unused-vars
      threadInfo: ThreadInfo,
      // eslint-disable-next-line no-unused-vars
      onMessagesMeasured: ($ReadOnlyArray<ChatMessageItemWithHeight>) => mixed,
    ) => {},
    unregister: () => {},
  });

  contextValue = {
    registerMeasurer: this.registerMeasurer,
  };

  render() {
    return (
      <ChatContext.Provider value={this.contextValue}>
        {this.props.children}
      </ChatContext.Provider>
    );
  }
}

export default React.memo<BaseProps>(function ConnectedChatContextProvider(
  props: BaseProps,
) {
  return <ChatContextProvider {...props} />;
});
