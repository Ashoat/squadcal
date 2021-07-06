// @flow

import * as React from 'react';
import {
  LayoutAnimation,
  TouchableWithoutFeedback,
  PixelRatio,
} from 'react-native';

import { messageKey } from 'lib/shared/message-utils';

import {
  type KeyboardState,
  KeyboardContext,
} from '../keyboard/keyboard-state';
import type { NavigationRoute } from '../navigation/route-names';
import { type VerticalBounds } from '../types/layout-types';
import type { LayoutEvent } from '../types/react-native';
import type { ChatNavigationProp } from './chat.react';
import type { ChatMultimediaMessageInfoItem } from './multimedia-message.react';
import {
  MultimediaMessage,
  multimediaMessageItemHeight,
} from './multimedia-message.react';
import type { ChatRobotextMessageInfoItemWithHeight } from './robotext-message.react';
import {
  RobotextMessage,
  robotextMessageItemHeight,
} from './robotext-message.react';
import type { ChatTextMessageInfoItemWithHeight } from './text-message.react';
import { TextMessage, textMessageItemHeight } from './text-message.react';
import { timestampHeight } from './timestamp.react';

export type ChatMessageInfoItemWithHeight =
  | ChatRobotextMessageInfoItemWithHeight
  | ChatTextMessageInfoItemWithHeight
  | ChatMultimediaMessageInfoItem;

function messageItemHeight(item: ChatMessageInfoItemWithHeight) {
  let height = 0;
  if (item.messageShapeType === 'text') {
    height += textMessageItemHeight(item);
  } else if (item.messageShapeType === 'multimedia') {
    height += multimediaMessageItemHeight(item);
  } else {
    height += robotextMessageItemHeight(item);
  }
  if (item.startsConversation) {
    height += timestampHeight;
  }
  return height;
}

type BaseProps = {|
  +item: ChatMessageInfoItemWithHeight,
  +focused: boolean,
  +navigation: ChatNavigationProp<'MessageList'>,
  +route: NavigationRoute<'MessageList'>,
  +toggleFocus: (messageKey: string) => void,
  +verticalBounds: ?VerticalBounds,
|};
type Props = {|
  ...BaseProps,
  // withKeyboardState
  +keyboardState: ?KeyboardState,
|};
class Message extends React.PureComponent<Props> {
  componentDidUpdate(prevProps: Props) {
    if (
      (prevProps.focused || prevProps.item.startsConversation) !==
      (this.props.focused || this.props.item.startsConversation)
    ) {
      LayoutAnimation.easeInEaseOut();
    }
  }

  render() {
    let message;
    if (this.props.item.messageShapeType === 'text') {
      message = (
        <TextMessage
          item={this.props.item}
          navigation={this.props.navigation}
          route={this.props.route}
          focused={this.props.focused}
          toggleFocus={this.props.toggleFocus}
          verticalBounds={this.props.verticalBounds}
        />
      );
    } else if (this.props.item.messageShapeType === 'multimedia') {
      message = (
        <MultimediaMessage
          item={this.props.item}
          focused={this.props.focused}
          verticalBounds={this.props.verticalBounds}
        />
      );
    } else {
      message = (
        <RobotextMessage
          item={this.props.item}
          navigation={this.props.navigation}
          route={this.props.route}
          focused={this.props.focused}
          toggleFocus={this.props.toggleFocus}
          verticalBounds={this.props.verticalBounds}
        />
      );
    }

    const onLayout = __DEV__ ? this.onLayout : undefined;
    return (
      <TouchableWithoutFeedback
        onPress={this.dismissKeyboard}
        onLayout={onLayout}
      >
        {message}
      </TouchableWithoutFeedback>
    );
  }

  onLayout = (event: LayoutEvent) => {
    if (this.props.focused) {
      return;
    }

    const measuredHeight = event.nativeEvent.layout.height;
    const expectedHeight = messageItemHeight(this.props.item);

    const pixelRatio = 1 / PixelRatio.get();
    const distance = Math.abs(measuredHeight - expectedHeight);
    if (distance < pixelRatio) {
      return;
    }

    const approxMeasuredHeight = Math.round(measuredHeight * 100) / 100;
    const approxExpectedHeight = Math.round(expectedHeight * 100) / 100;
    console.log(
      `Message height for ${this.props.item.messageShapeType} ` +
        `${messageKey(this.props.item.messageInfo)} was expected to be ` +
        `${approxExpectedHeight} but is actually ${approxMeasuredHeight}. ` +
        "This means MessageList's FlatList isn't getting the right item " +
        'height for some of its nodes, which is guaranteed to cause glitchy ' +
        'behavior. Please investigate!!',
    );
  };

  dismissKeyboard = () => {
    const { keyboardState } = this.props;
    keyboardState && keyboardState.dismissKeyboard();
  };
}

const ConnectedMessage = React.memo<BaseProps>(function ConnectedMessage(
  props: BaseProps,
) {
  const keyboardState = React.useContext(KeyboardContext);
  return <Message {...props} keyboardState={keyboardState} />;
});

export { ConnectedMessage as Message, messageItemHeight };
