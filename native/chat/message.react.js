// @flow

import { useFocusEffect } from '@react-navigation/native';
import * as React from 'react';
import {
  LayoutAnimation,
  TouchableWithoutFeedback,
  PixelRatio,
  StyleSheet,
  View,
} from 'react-native';

import { messageKey } from 'lib/shared/message-utils';
import { getPendingThreadID } from 'lib/shared/thread-utils';
import { threadTypes } from 'lib/types/thread-types';

import {
  type KeyboardState,
  KeyboardContext,
} from '../keyboard/keyboard-state';
import { activeThreadSelector } from '../navigation/nav-selectors';
import { NavContext } from '../navigation/navigation-context';
import type { NavigationRoute } from '../navigation/route-names';
import { useSelector } from '../redux/redux-utils';
import { type VerticalBounds } from '../types/layout-types';
import type { LayoutEvent } from '../types/react-native';
import type { ChatNavigationProp } from './chat.react';
import {
  multimediaMessageItemHeight,
  type ChatMultimediaMessageInfoItem,
} from './multimedia-message-utils';
import MultimediaMessage from './multimedia-message.react';
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
  +visible?: boolean,
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
          toggleFocus={this.props.toggleFocus}
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
    const messageStyle = this.props.visible === false ? styles.hidden : null;
    return (
      <TouchableWithoutFeedback
        onPress={this.dismissKeyboard}
        onLayout={onLayout}
      >
        <View style={messageStyle}>{message}</View>
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

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
});

const ConnectedMessage = React.memo<BaseProps>(function ConnectedMessage(
  props: BaseProps,
) {
  const keyboardState = React.useContext(KeyboardContext);
  const [isVisible, setVisible] = React.useState(true);
  const navContext = React.useContext(NavContext);
  const activeThreadID = activeThreadSelector(navContext);
  const activeThread = useSelector((state) =>
    activeThreadID ? state.threadStore.threadInfos[activeThreadID] : null,
  );
  useFocusEffect(
    React.useCallback(() => {
      if (!isVisible) {
        setVisible(true);
      }
    }, [isVisible]),
  );
  React.useEffect(() => {
    setVisible(true);
    if (
      activeThread?.sourceMessageID === props.item.messageInfo.id ||
      activeThreadID ===
        getPendingThreadID(threadTypes.SIDEBAR, [], props.item.messageInfo.id)
    ) {
      setVisible(false);
    }
  }, [activeThread, activeThreadID, props.item.messageInfo.id]);
  React.useEffect(() => {
    console.log(activeThreadID);
  }, [activeThreadID]);
  return (
    <Message {...props} keyboardState={keyboardState} visible={isVisible} />
  );
});

export { ConnectedMessage as Message, messageItemHeight };
