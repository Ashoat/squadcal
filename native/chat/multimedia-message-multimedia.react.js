// @flow

import invariant from 'invariant';
import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSelector } from 'react-redux';

import { messageKey } from 'lib/shared/message-utils';
import { relationshipBlockedInEitherDirection } from 'lib/shared/relationship-utils';
import { threadHasPermission } from 'lib/shared/thread-utils';
import { type MediaInfo } from 'lib/types/media-types';
import { threadPermissions } from 'lib/types/thread-types';
import type { UserInfo } from 'lib/types/user-types';

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
  type NavigationRoute,
  VideoPlaybackModalRouteName,
  MultimediaModalRouteName,
  MultimediaTooltipModalRouteName,
} from '../navigation/route-names';
import { type Colors, useColors } from '../themes/colors';
import { type VerticalBounds } from '../types/layout-types';
import type { ViewStyle } from '../types/styles';
import type { ChatNavigationProp } from './chat.react';
import InlineMultimedia from './inline-multimedia.react';
import type { ChatMultimediaMessageInfoItem } from './multimedia-message.react';
import { multimediaTooltipHeight } from './multimedia-tooltip-modal.react';

/* eslint-disable import/no-named-as-default-member */
const { Value, sub, interpolate, Extrapolate } = Animated;
/* eslint-enable import/no-named-as-default-member */

type BaseProps = {|
  +mediaInfo: MediaInfo,
  +item: ChatMultimediaMessageInfoItem,
  +navigation: ChatNavigationProp<'MessageList'>,
  +route: NavigationRoute<'MessageList'>,
  +verticalBounds: ?VerticalBounds,
  +verticalOffset: number,
  +style: ViewStyle,
  +postInProgress: boolean,
  +pendingUpload: ?PendingMultimediaUpload,
  +messageFocused: boolean,
  +toggleMessageFocus: (messageKey: string) => void,
|};
type Props = {|
  ...BaseProps,
  // Redux state
  +colors: Colors,
  +messageCreatorUserInfo: UserInfo,
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
    for (let overlay of visibleOverlays) {
      if (
        overlay.routeName === MultimediaModalRouteName &&
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
            onLongPress={this.onLongPress}
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

    // const overlayContext = MultimediaMessageMultimedia.getOverlayContext(
    //   this.props,
    // );
    // overlayContext.setScrollBlockingModalStatus('open');

    // const { mediaInfo, item } = this.props;
    // view.measure((x, y, width, height, pageX, pageY) => {
    // console.log(this.props.item.threadInfo.color);
    // const coordinates = { x: pageX, y: pageY, width, height };
    this.props.navigation.navigate({
      name: VideoPlaybackModalRouteName,
      params: {
        videoUri:
          'https://blob.sh/atul/filtered-95714C70-7D19-43D5-897A-97022EFF8241.MP4',
      },
    });
    // this.props.navigation.navigate({
    //   name: MultimediaModalRouteName,
    //   key: MultimediaMessageMultimedia.getStableKey(this.props),
    //   params: {
    //     presentedFrom: this.props.route.key,
    //     mediaInfo,
    //     item,
    //     initialCoordinates: coordinates,
    //     verticalBounds,
    //   },
    // });
    // });
  };

  visibleEntryIDs() {
    const result = ['save'];

    const canCreateSidebars = threadHasPermission(
      this.props.item.threadInfo,
      threadPermissions.CREATE_SIDEBARS,
    );
    const creatorRelationship = this.props.messageCreatorUserInfo
      .relationshipStatus;
    const creatorRelationshipHasBlock =
      creatorRelationship &&
      relationshipBlockedInEitherDirection(creatorRelationship);

    if (this.props.item.threadCreatedFromMessage) {
      result.push('open_sidebar');
    } else if (canCreateSidebars && !creatorRelationshipHasBlock) {
      result.push('create_sidebar');
    }

    return result;
  }

  onLongPress = () => {
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

    const {
      messageFocused,
      toggleMessageFocus,
      item,
      mediaInfo,
      verticalOffset,
    } = this.props;
    if (!messageFocused) {
      toggleMessageFocus(messageKey(item.messageInfo));
    }

    const overlayContext = MultimediaMessageMultimedia.getOverlayContext(
      this.props,
    );
    overlayContext.setScrollBlockingModalStatus('open');

    view.measure((x, y, width, height, pageX, pageY) => {
      const coordinates = { x: pageX, y: pageY, width, height };

      const multimediaTop = pageY;
      const multimediaBottom = pageY + height;
      const boundsTop = verticalBounds.y;
      const boundsBottom = verticalBounds.y + verticalBounds.height;

      const belowMargin = 20;
      const belowSpace = multimediaTooltipHeight + belowMargin;
      const { isViewer } = item.messageInfo.creator;
      const directlyAboveMargin = isViewer ? 30 : 50;
      const aboveMargin = verticalOffset === 0 ? directlyAboveMargin : 20;
      const aboveSpace = multimediaTooltipHeight + aboveMargin;

      let location = 'below',
        margin = belowMargin;
      if (
        multimediaBottom + belowSpace > boundsBottom &&
        multimediaTop - aboveSpace > boundsTop
      ) {
        location = 'above';
        margin = aboveMargin;
      }

      this.props.navigation.navigate({
        name: MultimediaTooltipModalRouteName,
        params: {
          presentedFrom: this.props.route.key,
          mediaInfo,
          item,
          initialCoordinates: coordinates,
          verticalOffset,
          verticalBounds,
          location,
          margin,
          visibleEntryIDs: this.visibleEntryIDs(),
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
    const messageCreatorUserInfo = useSelector(
      (state) => state.userStore.userInfos[props.item.messageInfo.creator.id],
    );
    return (
      <MultimediaMessageMultimedia
        {...props}
        colors={colors}
        messageCreatorUserInfo={messageCreatorUserInfo}
        keyboardState={keyboardState}
        overlayContext={overlayContext}
      />
    );
  },
);
