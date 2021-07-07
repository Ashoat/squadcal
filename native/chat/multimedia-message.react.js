// @flow

import type {
  LeafRoute,
  NavigationProp,
  ParamListBase,
} from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as React from 'react';
import { View } from 'react-native';

import type { MediaInfo } from 'lib/types/media-types';

import {
  ImageModalRouteName,
  VideoPlaybackModalRouteName,
} from '../navigation/route-names';
import { type VerticalBounds } from '../types/layout-types';
import type { LayoutCoordinates } from '../types/layout-types';
import { ComposedMessage } from './composed-message.react';
import { InnerMultimediaMessage } from './inner-multimedia-message.react';
import {
  type ChatMultimediaMessageInfoItem,
  getMediaKey,
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
type State = {|
  +clickable: boolean,
|};
class MultimediaMessage extends React.PureComponent<Props, State> {
  state: State = {
    clickable: true,
  };

  setClickable = (clickable: boolean) => {
    this.setState({ clickable });
  };

  onPressMultimedia = (
    mediaInfo: MediaInfo,
    initialCoordinates: LayoutCoordinates,
  ) => {
    const { navigation, item, route, verticalBounds } = this.props;
    navigation.navigate({
      name:
        mediaInfo.type === 'video'
          ? VideoPlaybackModalRouteName
          : ImageModalRouteName,
      key: getMediaKey(item, mediaInfo),
      params: {
        presentedFrom: route.key,
        mediaInfo,
        item,
        initialCoordinates,
        verticalBounds,
      },
    });
  };

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
        <InnerMultimediaMessage
          item={item}
          verticalBounds={verticalBounds}
          onPressMultimedia={this.onPressMultimedia}
          clickable={this.state.clickable}
          setClickable={this.setClickable}
        />
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
