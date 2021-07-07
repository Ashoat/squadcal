// @flow

import {
  type LeafRoute,
  type NavigationProp,
  type ParamListBase,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import invariant from 'invariant';
import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { messageKey } from 'lib/shared/message-utils';
import { type MediaInfo } from 'lib/types/media-types';

import { type PendingMultimediaUpload } from '../input/input-state';
import {
  type KeyboardState,
  KeyboardContext,
} from '../keyboard/keyboard-state';
import {
  OverlayContext,
  type OverlayContextType,
} from '../navigation/overlay-context';
import {
  VideoPlaybackModalRouteName,
  ImageModalRouteName,
} from '../navigation/route-names';
import { type Colors, useColors } from '../themes/colors';
import { type VerticalBounds } from '../types/layout-types';
import type { ViewStyle } from '../types/styles';
import InlineMultimedia from './inline-multimedia.react';
import type { ChatMultimediaMessageInfoItem } from './multimedia-message-utils';

/* eslint-disable import/no-named-as-default-member */
const { Value, sub, interpolate, Extrapolate } = Animated;
/* eslint-enable import/no-named-as-default-member */

type BaseProps = {|
  +mediaInfo: MediaInfo,
  +item: ChatMultimediaMessageInfoItem,
  +verticalBounds: ?VerticalBounds,
  +style: ViewStyle,
  +postInProgress: boolean,
  +pendingUpload: ?PendingMultimediaUpload,
|};
type Props = {|
  ...BaseProps,
  +navigation: NavigationProp<ParamListBase>,
  +route: LeafRoute<>,
  // Redux state
  +colors: Colors,
  // withKeyboardState
  +keyboardState: ?KeyboardState,
  // withOverlayContext
  +overlayContext: ?OverlayContextType,
|};
type State = {|
  +opacity: number | Value,
|};
class MultimediaMessageMultimedia extends React.PureComponent<Props, State> {
  view: ?React.ElementRef<typeof View>;
  clickable = true;

  constructor(props: Props) {
    super(props);
    this.state = {
      opacity: this.getOpacity(),
    };
  }

  static getStableKey(props: Props) {
    const { item, mediaInfo } = props;
    return `multimedia|${messageKey(item.messageInfo)}|${mediaInfo.index}`;
  }

  static getOverlayContext(props: Props) {
    const { overlayContext } = props;
    invariant(
      overlayContext,
      'MultimediaMessageMultimedia should have OverlayContext',
    );
    return overlayContext;
  }

  static getModalOverlayPosition(props: Props) {
    const overlayContext = MultimediaMessageMultimedia.getOverlayContext(props);
    const { visibleOverlays } = overlayContext;
    for (const overlay of visibleOverlays) {
      if (
        overlay.routeName === ImageModalRouteName &&
        overlay.presentedFrom === props.route.key &&
        overlay.routeKey === MultimediaMessageMultimedia.getStableKey(props)
      ) {
        return overlay.position;
      }
    }
    return undefined;
  }

  getOpacity() {
    const overlayPosition = MultimediaMessageMultimedia.getModalOverlayPosition(
      this.props,
    );
    if (!overlayPosition) {
      return 1;
    }
    return sub(
      1,
      interpolate(overlayPosition, {
        inputRange: [0.1, 0.11],
        outputRange: [0, 1],
        extrapolate: Extrapolate.CLAMP,
      }),
    );
  }

  componentDidUpdate(prevProps: Props) {
    const overlayPosition = MultimediaMessageMultimedia.getModalOverlayPosition(
      this.props,
    );
    const prevOverlayPosition = MultimediaMessageMultimedia.getModalOverlayPosition(
      prevProps,
    );
    if (overlayPosition !== prevOverlayPosition) {
      this.setState({ opacity: this.getOpacity() });
    }

    const scrollIsDisabled =
      MultimediaMessageMultimedia.getOverlayContext(this.props)
        .scrollBlockingModalStatus !== 'closed';
    const scrollWasDisabled =
      MultimediaMessageMultimedia.getOverlayContext(prevProps)
        .scrollBlockingModalStatus !== 'closed';
    if (!scrollIsDisabled && scrollWasDisabled) {
      this.clickable = true;
    }
  }

  render() {
    const { opacity } = this.state;
    const wrapperStyles = [styles.container, { opacity }, this.props.style];

    const { mediaInfo, pendingUpload, postInProgress } = this.props;
    return (
      <Animated.View style={wrapperStyles}>
        <View style={styles.expand} onLayout={this.onLayout} ref={this.viewRef}>
          <InlineMultimedia
            mediaInfo={mediaInfo}
            onPress={this.onPress}
            postInProgress={postInProgress}
            pendingUpload={pendingUpload}
            spinnerColor={this.props.item.threadInfo.color}
          />
        </View>
      </Animated.View>
    );
  }

  onLayout = () => {};

  viewRef = (view: ?React.ElementRef<typeof View>) => {
    this.view = view;
  };

  onPress = () => {
    if (this.dismissKeyboardIfShowing()) {
      return;
    }

    const {
      view,
      props: { verticalBounds },
    } = this;
    if (!view || !verticalBounds) {
      return;
    }

    if (!this.clickable) {
      return;
    }
    this.clickable = false;

    const overlayContext = MultimediaMessageMultimedia.getOverlayContext(
      this.props,
    );
    overlayContext.setScrollBlockingModalStatus('open');

    const { mediaInfo, item } = this.props;
    view.measure((x, y, width, height, pageX, pageY) => {
      const coordinates = { x: pageX, y: pageY, width, height };
      this.props.navigation.navigate({
        name:
          mediaInfo.type === 'video'
            ? VideoPlaybackModalRouteName
            : ImageModalRouteName,
        key: MultimediaMessageMultimedia.getStableKey(this.props),
        params: {
          presentedFrom: this.props.route.key,
          mediaInfo,
          item,
          initialCoordinates: coordinates,
          verticalBounds,
        },
      });
    });
  };

  dismissKeyboardIfShowing = () => {
    const { keyboardState } = this.props;
    return !!(keyboardState && keyboardState.dismissKeyboardIfShowing());
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  expand: {
    flex: 1,
  },
});

export default React.memo<BaseProps>(
  function ConnectedMultimediaMessageMultimedia(props: BaseProps) {
    const colors = useColors();
    const keyboardState = React.useContext(KeyboardContext);
    const overlayContext = React.useContext(OverlayContext);
    const navigation = useNavigation();
    const route = useRoute();
    return (
      <MultimediaMessageMultimedia
        {...props}
        colors={colors}
        navigation={navigation}
        route={route}
        keyboardState={keyboardState}
        overlayContext={overlayContext}
      />
    );
  },
);
