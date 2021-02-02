// @flow

import { useNavigation } from '@react-navigation/native';
import * as React from 'react';
import { Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import type { ThreadInfo } from 'lib/types/thread-types';

import Button from '../components/button.react';
import { MessageListRouteName } from '../navigation/route-names';
import { useStyles } from '../themes/colors';
import type { ChatNavigationProp } from './chat.react';

type Props = {|
  +threadInfo: ThreadInfo,
  +positioning: 'left' | 'center' | 'right',
|};
function InlineSidebar(props: Props) {
  const { threadInfo } = props;
  const navigation: ChatNavigationProp<'MessageList'> = (useNavigation(): any);

  const onPress = React.useCallback(() => {
    navigation.navigate({
      name: MessageListRouteName,
      params: { threadInfo },
      key: `${MessageListRouteName}${threadInfo.id}`,
    });
  }, [navigation, threadInfo]);

  const styles = useStyles(unboundStyles);
  let viewerIcon, nonViewerIcon, alignStyle;
  if (props.positioning === 'right') {
    viewerIcon = <Icon name="corner-down-left" size={18} style={styles.icon} />;
    alignStyle = styles.rightAlign;
  } else if (props.positioning === 'left') {
    nonViewerIcon = (
      <Icon name="corner-down-right" size={18} style={styles.icon} />
    );
    alignStyle = styles.leftAlign;
  } else {
    nonViewerIcon = (
      <Icon name="corner-down-right" size={18} style={styles.icon} />
    );
    alignStyle = styles.centerAlign;
  }

  const unreadStyle = threadInfo.currentUser.unread ? styles.unread : null;
  return (
    <View style={[styles.content, alignStyle]}>
      <Button style={styles.sidebar} onPress={onPress}>
        {nonViewerIcon}
        <Text style={[styles.name, unreadStyle]}>sidebar</Text>
        {viewerIcon}
      </Button>
    </View>
  );
}

const inlineSidebarHeight = 20;
const inlineSidebarMarginTop = 5;
const inlineSidebarMarginBottom = 3;

const unboundStyles = {
  content: {
    flexDirection: 'row',
    marginRight: 30,
    marginLeft: 10,
    flex: 1,
    height: inlineSidebarHeight,
  },
  unread: {
    fontWeight: 'bold',
  },
  sidebar: {
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
  },
  icon: {
    color: 'listForegroundTertiaryLabel',
  },
  name: {
    paddingTop: 1,
    color: 'listForegroundTertiaryLabel',
    fontSize: 16,
    paddingLeft: 4,
    paddingRight: 2,
  },
  leftAlign: {
    justifyContent: 'flex-start',
  },
  rightAlign: {
    justifyContent: 'flex-end',
  },
  centerAlign: {
    justifyContent: 'center',
  },
};

export {
  InlineSidebar,
  inlineSidebarHeight,
  inlineSidebarMarginTop,
  inlineSidebarMarginBottom,
};