// @flow

import * as React from 'react';

import type { ChatMessageItem } from 'lib/selectors/chat-selectors';
import type { ThreadInfo } from 'lib/types/thread-types';

import { ChatContext } from './chat-context';
import ChatItemHeightMeasurer from './chat-item-height-measurer.react';
import type { ChatMessageItemWithHeight } from './message-list-container.react';

type Props = {|
  +children: React.Node,
|};

export type MeasurementTask = {|
  +messages: $ReadOnlyArray<ChatMessageItem>,
  +threadInfo: ThreadInfo,
  +onMessagesMeasured: (
    messagesWithHeight: $ReadOnlyArray<ChatMessageItemWithHeight>,
    measuredHeights: $ReadOnlyMap<string, number>,
  ) => mixed,
  +measurerID: number,
|};
type State = {|
  +measurements: $ReadOnlyArray<MeasurementTask>,
|};

class ChatContextProvider extends React.PureComponent<Props, State> {
  state: State = {
    measurements: [],
  };
  nextMeasurerID: number = 0;
  measuredHeights = new Map<number, $ReadOnlyMap<string, number>>();

  registerMeasurer = () => {
    const measurerID = this.nextMeasurerID++;
    return {
      measure: (
        messages: $ReadOnlyArray<ChatMessageItem>,
        threadInfo: ThreadInfo,
        onMessagesMeasured: (
          $ReadOnlyArray<ChatMessageItemWithHeight>,
        ) => mixed,
      ) =>
        this.measureMessages(
          messages,
          threadInfo,
          onMessagesMeasured,
          measurerID,
        ),
      unregister: () => {
        this.setState((state) => ({
          measurements: state.measurements.filter(
            (measurement) => measurement.measurerID !== measurerID,
          ),
        }));
        this.measuredHeights.delete(measurerID);
      },
    };
  };

  measureMessages = (
    messages: $ReadOnlyArray<ChatMessageItem>,
    threadInfo: ThreadInfo,
    onMessagesMeasured: ($ReadOnlyArray<ChatMessageItemWithHeight>) => mixed,
    measurerID: number,
  ) => {
    const measureCallback = (
      messagesWithHeight: $ReadOnlyArray<ChatMessageItemWithHeight>,
      measuredHeights: $ReadOnlyMap<string, number>,
    ) => {
      this.measuredHeights.set(measurerID, measuredHeights);
      onMessagesMeasured(messagesWithHeight);
    };
    const newMeasurement = {
      messages,
      threadInfo,
      onMessagesMeasured: measureCallback,
      measurerID,
    };
    this.setState((state) => {
      const withoutCurrentMeasurement = state.measurements.filter(
        (measurement) => measurement.measurerID !== measurerID,
      );
      return {
        measurements: [...withoutCurrentMeasurement, newMeasurement],
      };
    });
  };

  contextValue = {
    registerMeasurer: this.registerMeasurer,
  };

  render() {
    const heightMeasurers = this.state.measurements.map((measurement) => (
      <ChatItemHeightMeasurer
        key={measurement.measurerID}
        measurement={measurement}
      />
    ));
    return (
      <ChatContext.Provider value={this.contextValue}>
        {heightMeasurers}
        {this.props.children}
      </ChatContext.Provider>
    );
  }
}

export default ChatContextProvider;
