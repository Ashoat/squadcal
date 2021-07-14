// @flow

import { useFocusEffect } from '@react-navigation/native';
import invariant from 'invariant';
import _find from 'lodash/fp/find';
import * as React from 'react';
import { View, TouchableWithoutFeedback } from 'react-native';
import { useDispatch } from 'react-redux';
import { createSelector } from 'reselect';

import {
  fetchMessagesBeforeCursorActionTypes,
  fetchMessagesBeforeCursor,
  fetchMostRecentMessagesActionTypes,
  fetchMostRecentMessages,
} from 'lib/actions/message-actions';
import { registerFetchKey } from 'lib/reducers/loading-reducer';
import { messageKey } from 'lib/shared/message-utils';
import { useWatchThread } from 'lib/shared/thread-utils';
import type { FetchMessageInfosPayload } from 'lib/types/message-types';
import { type ThreadInfo, threadTypes } from 'lib/types/thread-types';
import {
  type DispatchActionPromise,
  useServerCall,
  useDispatchActionPromise,
} from 'lib/utils/action-utils';

import ListLoadingIndicator from '../components/list-loading-indicator.react';
import {
  type KeyboardState,
  KeyboardContext,
} from '../keyboard/keyboard-state';
import { defaultStackScreenOptions } from '../navigation/options';
import {
  OverlayContext,
  type OverlayContextType,
} from '../navigation/overlay-context';
import type { NavigationRoute } from '../navigation/route-names';
import { useSelector } from '../redux/redux-utils';
import {
  useStyles,
  type IndicatorStyle,
  useIndicatorStyle,
} from '../themes/colors';
import type { VerticalBounds } from '../types/layout-types';
import { setCurrentTransitionSidebarSourceIDType } from '../types/nav-types';
import type { ViewToken } from '../types/react-native';
import { ChatList } from './chat-list.react';
import type { ChatNavigationProp } from './chat.react';
import type { ChatMessageItemWithHeight } from './message-list-container.react';
import { Message, type ChatMessageInfoItemWithHeight } from './message.react';
import RelationshipPrompt from './relationship-prompt.react';

type BaseProps = {|
  +threadInfo: ThreadInfo,
  +messageListData: $ReadOnlyArray<ChatMessageItemWithHeight>,
  +navigation: ChatNavigationProp<'MessageList'>,
  +route: NavigationRoute<'MessageList'>,
|};
type Props = {|
  ...BaseProps,
  // Redux state
  +startReached: boolean,
  +styles: typeof unboundStyles,
  +indicatorStyle: IndicatorStyle,
  +currentTransitionSidebarSourceID: ?string,
  // Redux dispatch functions
  +dispatchActionPromise: DispatchActionPromise,
  // async functions that hit server APIs
  +fetchMessagesBeforeCursor: (
    threadID: string,
    beforeMessageID: string,
  ) => Promise<FetchMessageInfosPayload>,
  +fetchMostRecentMessages: (
    threadID: string,
  ) => Promise<FetchMessageInfosPayload>,
  // withOverlayContext
  +overlayContext: ?OverlayContextType,
  // withKeyboardState
  +keyboardState: ?KeyboardState,
|};
type State = {|
  +focusedMessageKey: ?string,
  +messageListVerticalBounds: ?VerticalBounds,
  +loadingFromScroll: boolean,
|};
type PropsAndState = {|
  ...Props,
  ...State,
|};
type FlatListExtraData = {|
  messageListVerticalBounds: ?VerticalBounds,
  focusedMessageKey: ?string,
  navigation: ChatNavigationProp<'MessageList'>,
  route: NavigationRoute<'MessageList'>,
  currentTransitionSidebarSourceID: ?string,
|};
class MessageList extends React.PureComponent<Props, State> {
  state: State = {
    focusedMessageKey: null,
    messageListVerticalBounds: null,
    loadingFromScroll: false,
  };
  flatListContainer: ?React.ElementRef<typeof View>;

  flatListExtraDataSelector = createSelector(
    (propsAndState: PropsAndState) => propsAndState.messageListVerticalBounds,
    (propsAndState: PropsAndState) => propsAndState.focusedMessageKey,
    (propsAndState: PropsAndState) => propsAndState.navigation,
    (propsAndState: PropsAndState) => propsAndState.route,
    (propsAndState: PropsAndState) =>
      propsAndState.currentTransitionSidebarSourceID,
    (
      messageListVerticalBounds: ?VerticalBounds,
      focusedMessageKey: ?string,
      navigation: ChatNavigationProp<'MessageList'>,
      route: NavigationRoute<'MessageList'>,
      currentTransitionSidebarSourceID: ?string,
    ) => ({
      messageListVerticalBounds,
      focusedMessageKey,
      navigation,
      route,
      currentTransitionSidebarSourceID,
    }),
  );

  get flatListExtraData(): FlatListExtraData {
    return this.flatListExtraDataSelector({ ...this.props, ...this.state });
  }

  static getOverlayContext(props: Props) {
    const { overlayContext } = props;
    invariant(overlayContext, 'MessageList should have OverlayContext');
    return overlayContext;
  }

  static scrollDisabled(props: Props) {
    const overlayContext = MessageList.getOverlayContext(props);
    return overlayContext.scrollBlockingModalStatus !== 'closed';
  }

  static modalOpen(props: Props) {
    const overlayContext = MessageList.getOverlayContext(props);
    return overlayContext.scrollBlockingModalStatus === 'open';
  }

  componentDidUpdate(prevProps: Props) {
    const newListData = this.props.messageListData;
    const oldListData = prevProps.messageListData;
    if (
      this.state.loadingFromScroll &&
      (newListData.length > oldListData.length || this.props.startReached)
    ) {
      this.setState({ loadingFromScroll: false });
    }

    const modalIsOpen = MessageList.modalOpen(this.props);
    const modalWasOpen = MessageList.modalOpen(prevProps);
    if (!modalIsOpen && modalWasOpen) {
      this.setState({ focusedMessageKey: null });
    }

    if (defaultStackScreenOptions.gestureEnabled) {
      const scrollIsDisabled = MessageList.scrollDisabled(this.props);
      const scrollWasDisabled = MessageList.scrollDisabled(prevProps);
      if (!scrollWasDisabled && scrollIsDisabled) {
        this.props.navigation.setOptions({ gestureEnabled: false });
      } else if (scrollWasDisabled && !scrollIsDisabled) {
        this.props.navigation.setOptions({ gestureEnabled: true });
      }
    }
  }

  dismissKeyboard = () => {
    const { keyboardState } = this.props;
    keyboardState && keyboardState.dismissKeyboard();
  };

  renderItem = (row: { item: ChatMessageItemWithHeight }) => {
    if (row.item.itemType === 'loader') {
      return (
        <TouchableWithoutFeedback onPress={this.dismissKeyboard}>
          <View style={this.props.styles.listLoadingIndicator}>
            <ListLoadingIndicator />
          </View>
        </TouchableWithoutFeedback>
      );
    }
    const messageInfoItem: ChatMessageInfoItemWithHeight = row.item;
    const {
      messageListVerticalBounds,
      focusedMessageKey,
      navigation,
      route,
      currentTransitionSidebarSourceID,
    } = this.flatListExtraData;
    const focused =
      messageKey(messageInfoItem.messageInfo) === focusedMessageKey;
    const isVisible =
      messageInfoItem.messageInfo.id !== currentTransitionSidebarSourceID;
    return (
      <Message
        item={messageInfoItem}
        focused={focused}
        navigation={navigation}
        route={route}
        toggleFocus={this.toggleMessageFocus}
        verticalBounds={messageListVerticalBounds}
        visible={isVisible}
      />
    );
  };

  toggleMessageFocus = (inMessageKey: string) => {
    if (this.state.focusedMessageKey === inMessageKey) {
      this.setState({ focusedMessageKey: null });
    } else {
      this.setState({ focusedMessageKey: inMessageKey });
    }
  };

  // Actually header, it's just that our FlatList is inverted
  ListFooterComponent = () => <View style={this.props.styles.header} />;

  render() {
    const { messageListData, startReached } = this.props;
    const footer = startReached ? this.ListFooterComponent : undefined;
    let relationshipPrompt = null;
    if (this.props.threadInfo.type === threadTypes.PERSONAL) {
      relationshipPrompt = (
        <RelationshipPrompt
          pendingPersonalThreadUserInfo={
            this.props.route.params.pendingPersonalThreadUserInfo
          }
          threadInfo={this.props.threadInfo}
        />
      );
    }
    return (
      <View
        style={this.props.styles.container}
        ref={this.flatListContainerRef}
        onLayout={this.onFlatListContainerLayout}
      >
        {relationshipPrompt}
        <ChatList
          navigation={this.props.navigation}
          inverted={true}
          data={messageListData}
          renderItem={this.renderItem}
          onViewableItemsChanged={this.onViewableItemsChanged}
          ListFooterComponent={footer}
          scrollsToTop={false}
          scrollEnabled={!MessageList.scrollDisabled(this.props)}
          extraData={this.flatListExtraData}
          indicatorStyle={this.props.indicatorStyle}
          keyboardShouldPersistTaps="always"
        />
      </View>
    );
  }

  flatListContainerRef = (
    flatListContainer: ?React.ElementRef<typeof View>,
  ) => {
    this.flatListContainer = flatListContainer;
  };

  onFlatListContainerLayout = () => {
    const { flatListContainer } = this;
    if (!flatListContainer) {
      return;
    }
    flatListContainer.measure((x, y, width, height, pageX, pageY) => {
      if (
        height === null ||
        height === undefined ||
        pageY === null ||
        pageY === undefined
      ) {
        return;
      }
      this.setState({ messageListVerticalBounds: { height, y: pageY } });
    });
  };

  onViewableItemsChanged = (info: {
    viewableItems: ViewToken[],
    changed: ViewToken[],
  }) => {
    if (this.state.focusedMessageKey) {
      let focusedMessageVisible = false;
      for (const token of info.viewableItems) {
        if (
          token.item.itemType === 'message' &&
          messageKey(token.item.messageInfo) === this.state.focusedMessageKey
        ) {
          focusedMessageVisible = true;
          break;
        }
      }
      if (!focusedMessageVisible) {
        this.setState({ focusedMessageKey: null });
      }
    }

    const loader = _find({ key: 'loader' })(info.viewableItems);
    if (!loader || this.state.loadingFromScroll) {
      return;
    }

    const oldestMessageServerID = this.oldestMessageServerID();
    if (oldestMessageServerID) {
      this.setState({ loadingFromScroll: true });
      const threadID = this.props.threadInfo.id;
      this.props.dispatchActionPromise(
        fetchMessagesBeforeCursorActionTypes,
        this.props.fetchMessagesBeforeCursor(threadID, oldestMessageServerID),
      );
    }
  };

  oldestMessageServerID(): ?string {
    const data = this.props.messageListData;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].itemType === 'message' && data[i].messageInfo.id) {
        return data[i].messageInfo.id;
      }
    }
    return null;
  }
}

const unboundStyles = {
  container: {
    backgroundColor: 'listBackground',
    flex: 1,
  },
  header: {
    height: 12,
  },
  listLoadingIndicator: {
    flex: 1,
  },
};

registerFetchKey(fetchMessagesBeforeCursorActionTypes);
registerFetchKey(fetchMostRecentMessagesActionTypes);

export default React.memo<BaseProps>(function ConnectedMessageList(
  props: BaseProps,
) {
  const keyboardState = React.useContext(KeyboardContext);
  const overlayContext = React.useContext(OverlayContext);

  const threadID = props.threadInfo.id;
  const startReached = useSelector(
    (state) =>
      !!(
        state.messageStore.threads[threadID] &&
        state.messageStore.threads[threadID].startReached
      ),
  );

  const styles = useStyles(unboundStyles);
  const indicatorStyle = useIndicatorStyle();

  const dispatchActionPromise = useDispatchActionPromise();
  const callFetchMessagesBeforeCursor = useServerCall(
    fetchMessagesBeforeCursor,
  );
  const callFetchMostRecentMessages = useServerCall(fetchMostRecentMessages);

  useWatchThread(props.threadInfo);

  const currentTransitionSidebarSourceID = useSelector(
    (state) => state.navInfo.currentTransitionSidebarSourceID,
  );

  const dispatch = useDispatch();
  useFocusEffect(
    React.useCallback(() => {
      if (currentTransitionSidebarSourceID) {
        dispatch({
          type: setCurrentTransitionSidebarSourceIDType,
          payload: null,
        });
      }
    }, [currentTransitionSidebarSourceID, dispatch]),
  );

  return (
    <MessageList
      {...props}
      startReached={startReached}
      styles={styles}
      indicatorStyle={indicatorStyle}
      currentTransitionSidebarSourceID={currentTransitionSidebarSourceID}
      dispatchActionPromise={dispatchActionPromise}
      fetchMessagesBeforeCursor={callFetchMessagesBeforeCursor}
      fetchMostRecentMessages={callFetchMostRecentMessages}
      overlayContext={overlayContext}
      keyboardState={keyboardState}
    />
  );
});
