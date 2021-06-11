// @flow

import invariant from 'invariant';
import * as React from 'react';
import { View } from 'react-native';

import {
  type ChatMessageItem,
  useMessageListData,
} from 'lib/selectors/chat-selectors';
import {
  userInfoSelectorForPotentialMembers,
  userSearchIndexForPotentialMembers,
} from 'lib/selectors/user-selectors';
import { getPotentialMemberItems } from 'lib/shared/search-utils';
import { useExistingThreadInfoFinder } from 'lib/shared/thread-utils';
import type { ThreadInfo } from 'lib/types/thread-types';
import type { AccountUserInfo, UserListItem } from 'lib/types/user-types';

import ContentLoading from '../components/content-loading.react';
import { InputStateContext } from '../input/input-state';
import {
  OverlayContext,
  type OverlayContextType,
} from '../navigation/overlay-context';
import type { NavigationRoute } from '../navigation/route-names';
import { useSelector } from '../redux/redux-utils';
import { type Colors, useColors, useStyles } from '../themes/colors';
import { type MessagesMeasurer, useHeightMeasurer } from './chat-context';
import ChatInputBar from './chat-input-bar.react';
import type { ChatNavigationProp } from './chat.react';
import MessageListThreadSearch from './message-list-thread-search.react';
import {
  MessageListContext,
  useMessageListContext,
} from './message-list-types';
import MessageList from './message-list.react';
import type { ChatMessageInfoItemWithHeight } from './message.react';

export type ChatMessageItemWithHeight =
  | {| itemType: 'loader' |}
  | ChatMessageInfoItemWithHeight;

type BaseProps = {|
  +navigation: ChatNavigationProp<'MessageList'>,
  +route: NavigationRoute<'MessageList'>,
|};
type Props = {|
  ...BaseProps,
  // Redux state
  +usernameInputText: string,
  +updateUsernameInput: (text: string) => void,
  +userInfoInputArray: $ReadOnlyArray<AccountUserInfo>,
  +updateTagInput: (items: $ReadOnlyArray<AccountUserInfo>) => void,
  +resolveToUser: (user: AccountUserInfo) => void,
  +otherUserInfos: { [id: string]: AccountUserInfo },
  +userSearchResults: $ReadOnlyArray<UserListItem>,
  +threadInfo: ThreadInfo,
  +messageListData: $ReadOnlyArray<ChatMessageItem>,
  +colors: Colors,
  +styles: typeof unboundStyles,
  // withOverlayContext
  +overlayContext: ?OverlayContextType,
  +measureMessages: MessagesMeasurer,
|};
type State = {|
  +listDataWithHeights: ?$ReadOnlyArray<ChatMessageItemWithHeight>,
|};
class MessageListContainer extends React.PureComponent<Props, State> {
  state: State = {
    listDataWithHeights: null,
  };
  pendingListDataWithHeights: ?$ReadOnlyArray<ChatMessageItemWithHeight>;

  get frozen() {
    const { overlayContext } = this.props;
    invariant(
      overlayContext,
      'MessageListContainer should have OverlayContext',
    );
    return overlayContext.scrollBlockingModalStatus !== 'closed';
  }

  componentDidMount() {
    this.props.measureMessages(
      this.props.messageListData,
      this.props.threadInfo,
      this.allHeightsMeasured,
    );
  }

  componentDidUpdate(prevProps: Props) {
    const oldListData = prevProps.messageListData;
    const newListData = this.props.messageListData;
    if (!newListData && oldListData) {
      this.setState({ listDataWithHeights: null });
    }

    if (
      oldListData !== newListData ||
      prevProps.threadInfo !== this.props.threadInfo ||
      prevProps.measureMessages !== this.props.measureMessages
    ) {
      this.props.measureMessages(
        newListData,
        this.props.threadInfo,
        this.allHeightsMeasured,
      );
    }

    if (!this.frozen && this.pendingListDataWithHeights) {
      this.setState({ listDataWithHeights: this.pendingListDataWithHeights });
      this.pendingListDataWithHeights = undefined;
    }
  }

  render() {
    const { threadInfo, styles } = this.props;
    const { listDataWithHeights } = this.state;
    const { searching } = this.props.route.params;

    let searchComponent = null;
    if (searching) {
      searchComponent = (
        <MessageListThreadSearch
          usernameInputText={this.props.usernameInputText}
          updateUsernameInput={this.props.updateUsernameInput}
          userInfoInputArray={this.props.userInfoInputArray}
          updateTagInput={this.props.updateTagInput}
          resolveToUser={this.props.resolveToUser}
          otherUserInfos={this.props.otherUserInfos}
          userSearchResults={this.props.userSearchResults}
        />
      );
    }

    const showMessageList =
      !searching || this.props.userInfoInputArray.length > 0;
    let threadContent = null;
    if (showMessageList) {
      let messageList;
      if (listDataWithHeights) {
        messageList = (
          <MessageList
            threadInfo={threadInfo}
            messageListData={listDataWithHeights}
            navigation={this.props.navigation}
            route={this.props.route}
          />
        );
      } else {
        messageList = (
          <ContentLoading fillType="flex" colors={this.props.colors} />
        );
      }

      threadContent = (
        <View style={styles.threadContent}>
          {messageList}
          <ChatInputBar
            threadInfo={threadInfo}
            navigation={this.props.navigation}
            route={this.props.route}
          />
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {searchComponent}
        {threadContent}
      </View>
    );
  }

  allHeightsMeasured = (
    listDataWithHeights: $ReadOnlyArray<ChatMessageItemWithHeight>,
  ) => {
    if (this.frozen) {
      this.pendingListDataWithHeights = listDataWithHeights;
    } else {
      this.setState({ listDataWithHeights });
    }
  };
}

const unboundStyles = {
  container: {
    backgroundColor: 'listBackground',
    flex: 1,
  },
  threadContent: {
    flex: 1,
  },
};

export default React.memo<BaseProps>(function ConnectedMessageListContainer(
  props: BaseProps,
) {
  const [usernameInputText, setUsernameInputText] = React.useState('');
  const [userInfoInputArray, setUserInfoInputArray] = React.useState<
    $ReadOnlyArray<AccountUserInfo>,
  >([]);

  const otherUserInfos = useSelector(userInfoSelectorForPotentialMembers);
  const userSearchIndex = useSelector(userSearchIndexForPotentialMembers);
  const userSearchResults = React.useMemo(
    () =>
      getPotentialMemberItems(
        usernameInputText,
        otherUserInfos,
        userSearchIndex,
        userInfoInputArray.map((userInfo) => userInfo.id),
      ),
    [usernameInputText, otherUserInfos, userSearchIndex, userInfoInputArray],
  );

  const [baseThreadInfo, setBaseThreadInfo] = React.useState(
    props.route.params.threadInfo,
  );

  const existingThreadInfoFinder = useExistingThreadInfoFinder(baseThreadInfo);

  const isSearching = !!props.route.params.searching;
  const threadInfo = React.useMemo(
    () =>
      existingThreadInfoFinder({
        searching: isSearching,
        userInfoInputArray,
      }),
    [existingThreadInfoFinder, isSearching, userInfoInputArray],
  );
  invariant(threadInfo, 'threadInfo must be specified in messageListContainer');

  const inputState = React.useContext(InputStateContext);
  const hideSearch = React.useCallback(() => {
    setBaseThreadInfo(threadInfo);
    props.navigation.setParams({
      searching: false,
    });
  }, [props.navigation, threadInfo]);
  React.useEffect(() => {
    if (!isSearching) {
      return;
    }
    inputState?.registerSendCallback(hideSearch);
    return () => inputState?.unregisterSendCallback(hideSearch);
  }, [hideSearch, inputState, isSearching]);

  const { setParams } = props.navigation;
  React.useEffect(() => {
    setParams({ threadInfo });
  }, [setParams, threadInfo]);

  const updateTagInput = React.useCallback(
    (input: $ReadOnlyArray<AccountUserInfo>) => setUserInfoInputArray(input),
    [],
  );
  const updateUsernameInput = React.useCallback(
    (text: string) => setUsernameInputText(text),
    [],
  );
  const resolveToUser = React.useCallback(
    (user: AccountUserInfo) => {
      const resolvedThreadInfo = existingThreadInfoFinder({
        searching: true,
        userInfoInputArray: [user],
      });
      invariant(
        resolvedThreadInfo,
        'resolvedThreadInfo must be specified in messageListContainer',
      );
      setBaseThreadInfo(resolvedThreadInfo);
      setParams({ searching: false, threadInfo: resolvedThreadInfo });
    },
    [setParams, existingThreadInfoFinder],
  );

  const threadID = threadInfo.id;
  const messageListData = useMessageListData({
    searching: isSearching,
    userInfoInputArray,
    threadInfo,
  });
  invariant(
    messageListData,
    'messageListData must be specified in messageListContainer',
  );
  const colors = useColors();
  const styles = useStyles(unboundStyles);
  const overlayContext = React.useContext(OverlayContext);
  const messageListContext = useMessageListContext(threadID);
  const measureMessages = useHeightMeasurer();
  return (
    <MessageListContext.Provider value={messageListContext}>
      <MessageListContainer
        {...props}
        usernameInputText={usernameInputText}
        updateUsernameInput={updateUsernameInput}
        userInfoInputArray={userInfoInputArray}
        updateTagInput={updateTagInput}
        resolveToUser={resolveToUser}
        otherUserInfos={otherUserInfos}
        userSearchResults={userSearchResults}
        threadInfo={threadInfo}
        messageListData={messageListData}
        colors={colors}
        styles={styles}
        overlayContext={overlayContext}
        measureMessages={measureMessages}
      />
    </MessageListContext.Provider>
  );
});
