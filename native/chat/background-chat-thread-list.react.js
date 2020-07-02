// @flow

import type { ChatTopTabsNavigationProp } from './chat.react';

import * as React from 'react';
import { useSelector } from 'react-redux';
import { Text } from 'react-native';

import {
  threadInBackgroundChatList,
  emptyItemText,
} from 'lib/shared/thread-utils';
import { unreadBackgroundCount } from 'lib/selectors/thread-selectors';

import ChatThreadList from './chat-thread-list.react';
import { useStyles } from '../themes/colors';

type BackgroundChatThreadListProps = {
  navigation: ChatTopTabsNavigationProp<'BackgroundChatThreadList'>,
  ...
};
export default function BackgroundChatThreadList(
  props: BackgroundChatThreadListProps,
) {
  const unreadBackgroundThreadsNumber = useSelector(state =>
    unreadBackgroundCount(state),
  );

  const prevUnreadNumber = React.useRef(0);
  React.useEffect(() => {
    if (unreadBackgroundThreadsNumber === prevUnreadNumber.current) {
      return;
    }
    prevUnreadNumber.current = unreadBackgroundThreadsNumber;
    let title = 'Background';
    if (unreadBackgroundThreadsNumber !== 0) {
      title += ` (${unreadBackgroundThreadsNumber})`;
    }
    props.navigation.setOptions({ title });
  }, [props.navigation, unreadBackgroundThreadsNumber]);

  return (
    <ChatThreadList
      navigation={props.navigation}
      filterThreads={threadInBackgroundChatList}
      emptyItem={EmptyItem}
    />
  );
}

function EmptyItem() {
  const styles = useStyles(unboundStyles);
  return <Text style={styles.emptyList}>{emptyItemText}</Text>;
}

const unboundStyles = {
  emptyList: {
    color: 'listBackgroundLabel',
    fontSize: 17,
    marginHorizontal: 15,
    marginVertical: 10,
    textAlign: 'center',
  },
};
