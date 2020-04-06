// @flow

import type { ChatMessageInfoItemWithHeight } from './message.react';
import type { AppState } from '../redux/redux-setup';
import type { Styles } from '../types/styles';
import type { DisplayType } from './timestamp.react';

import * as React from 'react';
import { View, Text } from 'react-native';

import { stringForUser } from 'lib/shared/user-utils';
import { connect } from 'lib/utils/redux-utils';

import { Timestamp, timestampHeight } from './timestamp.react';
import { styleSelector } from '../themes/colors';
import { clusterEndHeight } from './composed-message.react';

type Props = {|
  item: ChatMessageInfoItemWithHeight,
  focused: boolean,
  display: DisplayType,
  // Redux state
  styles: Styles,
|};
function MessageHeader(props: Props) {
  const { item, focused, display } = props;
  const { creator, time } = item.messageInfo;
  const { isViewer } = creator;
  const modalDisplay = display === 'modal';

  let authorName = null;
  if (!isViewer && (modalDisplay || item.startsCluster)) {
    const style = [props.styles.authorName];
    if (modalDisplay) {
      style.push(props.styles.modal);
    }
    authorName = (
      <Text style={style} numberOfLines={1}>
        {stringForUser(creator)}
      </Text>
    );
  }

  const timestamp =
    modalDisplay || item.startsConversation ? (
      <Timestamp time={time} display={display} />
    ) : null;

  let style = null;
  if (focused && !modalDisplay) {
    let topMargin = 0;
    if (!item.startsCluster && !item.messageInfo.creator.isViewer) {
      topMargin += authorNameHeight + clusterEndHeight;
    }
    if (!item.startsConversation) {
      topMargin += timestampHeight;
    }
    style = { marginTop: topMargin };
  }

  return (
    <View style={style}>
      {timestamp}
      {authorName}
    </View>
  );
}

const authorNameHeight = 25;

const styles = {
  authorName: {
    fontSize: 14,
    marginLeft: 12,
    marginRight: 7,
    paddingHorizontal: 12,
    paddingVertical: 4,
    height: authorNameHeight,
    color: 'listBackgroundSecondaryLabel',
    bottom: 0,
  },
  modal: {
    // high contrast framed against OverlayNavigator-dimmed background
    color: 'white',
  },
};
const stylesSelector = styleSelector(styles);

const ConnectedMessageHeader = connect((state: AppState) => ({
  styles: stylesSelector(state),
}))(MessageHeader);

export { ConnectedMessageHeader as MessageHeader, authorNameHeight };
