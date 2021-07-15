// @flow

import invariant from 'invariant';
import _sum from 'lodash/fp/sum';
import * as React from 'react';
import {
  FlatList,
  Animated,
  Easing,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type {
  Props as FlatListProps,
  DefaultProps as FlatListDefaultProps,
} from 'react-native/Libraries/Lists/FlatList';

import type { ChatMessageItem } from 'lib/selectors/chat-selectors';
import { localIDPrefix, messageKey } from 'lib/shared/message-utils';

import {
  type KeyboardState,
  KeyboardContext,
} from '../keyboard/keyboard-state';
import type { TabNavigationProp } from '../navigation/app-navigator.react';
import { useSelector } from '../redux/redux-utils';
import type { ViewStyle } from '../types/styles';
import type { ChatNavigationProp } from './chat.react';
import type { ChatMessageItemWithHeight } from './message-list-container.react';
import { messageItemHeight } from './message.react';
import NewMessagesPill from './new-messages-pill.react';

function chatMessageItemKey(item: ChatMessageItemWithHeight | ChatMessageItem) {
  if (item.itemType === 'loader') {
    return 'loader';
  }
  return messageKey(item.messageInfo);
}

function chatMessageItemHeight(item: ChatMessageItemWithHeight) {
  if (item.itemType === 'loader') {
    return 56;
  }
  return messageItemHeight(item);
}

const animationSpec = {
  duration: 150,
  useNativeDriver: true,
};

type BaseProps = {|
  ...$ReadOnly<
    $Exact<
      React.Config<
        FlatListProps<ChatMessageItemWithHeight>,
        FlatListDefaultProps,
      >,
    >,
  >,
  +navigation: ChatNavigationProp<'MessageList'>,
  +data: $ReadOnlyArray<ChatMessageItemWithHeight>,
|};
type Props = {|
  ...BaseProps,
  // Redux state
  +viewerID: ?string,
  // withKeyboardState
  +keyboardState: ?KeyboardState,
|};
type State = {|
  +newMessageCount: number,
|};
class ChatList extends React.PureComponent<Props, State> {
  state: State = {
    newMessageCount: 0,
  };

  flatList: ?React.ElementRef<typeof FlatList>;
  scrollPos = 0;

  newMessagesPillProgress = new Animated.Value(0);
  newMessagesPillStyle: ViewStyle;

  constructor(props: Props) {
    super(props);
    const sendButtonTranslateY = this.newMessagesPillProgress.interpolate({
      inputRange: [0, 1],
      outputRange: ([10, 0]: number[]), // Flow...
    });
    this.newMessagesPillStyle = {
      opacity: this.newMessagesPillProgress,
      transform: [{ translateY: sendButtonTranslateY }],
    };
  }

  componentDidMount() {
    const tabNavigation: ?TabNavigationProp<
      'Chat',
    > = this.props.navigation.dangerouslyGetParent();
    invariant(tabNavigation, 'ChatNavigator should be within TabNavigator');
    tabNavigation.addListener('tabPress', this.onTabPress);
  }

  componentWillUnmount() {
    const tabNavigation: ?TabNavigationProp<
      'Chat',
    > = this.props.navigation.dangerouslyGetParent();
    invariant(tabNavigation, 'ChatNavigator should be within TabNavigator');
    tabNavigation.removeListener('tabPress', this.onTabPress);
  }

  onTabPress = () => {
    const { flatList } = this;
    if (!this.props.navigation.isFocused() || !flatList) {
      return;
    }
    if (this.scrollPos > 0) {
      flatList.scrollToOffset({ offset: 0 });
    } else {
      this.props.navigation.popToTop();
    }
  };

  get scrolledToBottom() {
    return this.scrollPos <= 0;
  }

  componentDidUpdate(prevProps: Props) {
    const { flatList } = this;
    if (!flatList || this.props.data === prevProps.data) {
      return;
    }

    if (this.props.data.length < prevProps.data.length) {
      // This should only happen due to MessageStorePruner,
      // which will only prune a thread when it is off-screen
      flatList.scrollToOffset({ offset: 0, animated: false });
      return;
    }

    const { scrollPos } = this;

    let curDataIndex = 0,
      prevDataIndex = 0,
      heightSoFar = 0;
    let adjustScrollPos = 0,
      newLocalMessage = false,
      newRemoteMessageCount = 0;
    while (prevDataIndex < prevProps.data.length && heightSoFar <= scrollPos) {
      const prevItem = prevProps.data[prevDataIndex];
      invariant(prevItem, 'prevItem should exist');
      const prevItemKey = chatMessageItemKey(prevItem);
      const prevItemHeight = chatMessageItemHeight(prevItem);

      let curItem = this.props.data[curDataIndex];
      while (curItem) {
        const curItemKey = chatMessageItemKey(curItem);
        if (curItemKey === prevItemKey) {
          break;
        }

        if (curItemKey.startsWith(localIDPrefix)) {
          newLocalMessage = true;
        } else if (
          curItem.itemType === 'message' &&
          curItem.messageInfo.creator.id !== this.props.viewerID
        ) {
          newRemoteMessageCount++;
        }
        adjustScrollPos += chatMessageItemHeight(curItem);

        curDataIndex++;
        curItem = this.props.data[curDataIndex];
      }
      if (!curItem) {
        // Should never happen...
        console.log(
          `items not removed from ChatList, but ${prevItemKey} now missing`,
        );
        return;
      }

      const curItemHeight = chatMessageItemHeight(curItem);
      adjustScrollPos += curItemHeight - prevItemHeight;

      heightSoFar += prevItemHeight;
      prevDataIndex++;
      curDataIndex++;
    }

    if (adjustScrollPos === 0) {
      return;
    }

    flatList.scrollToOffset({
      offset: scrollPos + adjustScrollPos,
      animated: false,
    });

    if (newLocalMessage || scrollPos <= 0) {
      flatList.scrollToOffset({ offset: 0 });
    } else if (newRemoteMessageCount > 0) {
      this.setState((prevState) => ({
        newMessageCount: prevState.newMessageCount + newRemoteMessageCount,
      }));
      this.toggleNewMessagesPill(true);
    }
  }

  render() {
    const { navigation, viewerID, ...rest } = this.props;
    const { newMessageCount } = this.state;
    return (
      <TouchableWithoutFeedback onPress={this.onPressBackground}>
        <View style={styles.container}>
          <FlatList
            {...rest}
            keyExtractor={chatMessageItemKey}
            getItemLayout={ChatList.getItemLayout}
            onScroll={this.onScroll}
            ref={this.flatListRef}
          />
          <NewMessagesPill
            onPress={this.onPressNewMessagesPill}
            newMessageCount={newMessageCount}
            pointerEvents={newMessageCount > 0 ? 'auto' : 'none'}
            containerStyle={styles.newMessagesPillContainer}
            style={this.newMessagesPillStyle}
          />
        </View>
      </TouchableWithoutFeedback>
    );
  }

  flatListRef = (flatList: ?React.ElementRef<typeof FlatList>) => {
    this.flatList = flatList;
  };

  static getItemLayout(
    data: ?$ReadOnlyArray<ChatMessageItemWithHeight>,
    index: number,
  ) {
    if (!data) {
      return { length: 0, offset: 0, index };
    }
    const offset = ChatList.heightOfItems(data.filter((_, i) => i < index));
    const item = data[index];
    const length = item ? chatMessageItemHeight(item) : 0;
    return { length, offset, index };
  }

  static heightOfItems(
    data: $ReadOnlyArray<ChatMessageItemWithHeight>,
  ): number {
    return _sum(data.map(chatMessageItemHeight));
  }

  toggleNewMessagesPill(show: boolean) {
    Animated.timing(this.newMessagesPillProgress, {
      ...animationSpec,
      easing: show ? Easing.ease : Easing.out(Easing.ease),
      toValue: show ? 1 : 0,
    }).start(({ finished }) => {
      if (finished && !show) {
        this.setState({ newMessageCount: 0 });
      }
    });
  }

  onScroll = (event: {
    +nativeEvent: {
      +contentOffset: { +y: number },
      +contentSize: { +height: number },
    },
  }) => {
    this.scrollPos = event.nativeEvent.contentOffset.y;
    if (this.scrollPos <= 0) {
      this.toggleNewMessagesPill(false);
    }
    // $FlowFixMe FlatList doesn't type ScrollView props
    this.props.onScroll && this.props.onScroll(event);
  };

  onPressNewMessagesPill = () => {
    const { flatList } = this;
    if (!flatList) {
      return;
    }
    flatList.scrollToOffset({ offset: 0 });
    this.toggleNewMessagesPill(false);
  };

  onPressBackground = () => {
    const { keyboardState } = this.props;
    keyboardState && keyboardState.dismissKeyboard();
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  newMessagesPillContainer: {
    bottom: 30,
    position: 'absolute',
    right: 30,
  },
});

const ConnectedChatList = React.memo<BaseProps>(function ConnectedChatList(
  props: BaseProps,
) {
  const keyboardState = React.useContext(KeyboardContext);
  const viewerID = useSelector(
    (state) => state.currentUserInfo && state.currentUserInfo.id,
  );
  return (
    <ChatList {...props} keyboardState={keyboardState} viewerID={viewerID} />
  );
});

export {
  ConnectedChatList as ChatList,
  chatMessageItemKey,
  chatMessageItemHeight,
};
