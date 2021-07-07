// @flow

import type {
  LeafRoute,
  NavigationProp,
  ParamListBase,
} from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as React from 'react';
import { View } from 'react-native';

import { type VerticalBounds } from '../types/layout-types';
import { ComposedMessage } from './composed-message.react';
import { InnerMultimediaMessage } from './inner-multimedia-message.react';
import {
  type ChatMultimediaMessageInfoItem,
  multimediaMessageSendFailed,
} from './multimedia-message-utils';

type BaseProps = {|
  ...React.ElementConfig<typeof View>,
  +item: ChatMultimediaMessageInfoItem,
  +focused: boolean,
  +verticalBounds: ?VerticalBounds,
|};
type Props = {|
  ...BaseProps,
  +navigation: NavigationProp<ParamListBase>,
  +route: LeafRoute<>,
|};
class MultimediaMessage extends React.PureComponent<Props> {
  render() {
    const {
      item,
      focused,
      verticalBounds,
      navigation,
      route,
      ...viewProps
    } = this.props;
    return (
      <ComposedMessage
        item={item}
        sendFailed={multimediaMessageSendFailed(item)}
        focused={focused}
        {...viewProps}
      >
        <InnerMultimediaMessage item={item} verticalBounds={verticalBounds} />
      </ComposedMessage>
    );
  }
}

const ConnectedMultimediaMessage: React.ComponentType<BaseProps> = React.memo<BaseProps>(
  function ConnectedMultimediaMessage(props: BaseProps) {
    const navigation = useNavigation();
    const route = useRoute();
    return (
      <MultimediaMessage {...props} navigation={navigation} route={route} />
    );
  },
);

export default ConnectedMultimediaMessage;
