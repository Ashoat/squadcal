// @flow

import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { messageID } from 'lib/shared/message-utils';

import { InputStateContext } from '../input/input-state';
import type { AppNavigationProp } from '../navigation/app-navigator.react';
import type { TooltipRoute } from '../navigation/tooltip.react';
import { useSelector } from '../redux/redux-utils';
import InlineMultimedia from './inline-multimedia.react';
import { multimediaMessageBorderRadius } from './inner-multimedia-message.react';
import { MessageHeader } from './message-header.react';
import { getRoundedContainerStyle } from './rounded-corners';

/* eslint-disable import/no-named-as-default-member */
const { Value } = Animated;
/* eslint-enable import/no-named-as-default-member */

type Props = {|
  +navigation: AppNavigationProp<'MultimediaTooltipModal'>,
  +route: TooltipRoute<'MultimediaTooltipModal'>,
  +progress: Value,
|};
function MultimediaTooltipButton(props: Props): React.Node {
  const windowWidth = useSelector((state) => state.dimensions.width);
  const { progress } = props;
  const { initialCoordinates, verticalOffset } = props.route.params;
  const headerStyle = React.useMemo(() => {
    const bottom = initialCoordinates.height + verticalOffset;
    return {
      opacity: progress,
      position: 'absolute',
      left: -initialCoordinates.x,
      width: windowWidth,
      bottom,
    };
  }, [
    initialCoordinates.height,
    initialCoordinates.x,
    progress,
    verticalOffset,
    windowWidth,
  ]);

  const { mediaInfo, item } = props.route.params;
  const { id: mediaID } = mediaInfo;
  const ourMessageID = messageID(item.messageInfo);
  const inputState = React.useContext(InputStateContext);
  const pendingUploads =
    inputState &&
    inputState.pendingUploads &&
    inputState.pendingUploads[ourMessageID];
  const pendingUpload = pendingUploads && pendingUploads[mediaID];
  const postInProgress = !!pendingUploads;

  const roundedStyle = getRoundedContainerStyle(
    mediaInfo.corners,
    multimediaMessageBorderRadius,
  );

  const { navigation } = props;
  return (
    <React.Fragment>
      <Animated.View style={headerStyle}>
        <MessageHeader item={item} focused={true} display="modal" />
      </Animated.View>
      <View style={[styles.media, roundedStyle]}>
        <InlineMultimedia
          mediaInfo={mediaInfo}
          onPress={navigation.goBackOnce}
          onLongPress={navigation.goBackOnce}
          postInProgress={postInProgress}
          pendingUpload={pendingUpload}
          spinnerColor="white"
        />
      </View>
    </React.Fragment>
  );
}

const styles = StyleSheet.create({
  media: {
    flex: 1,
    overflow: 'hidden',
  },
});

export default React.memo<Props>(MultimediaTooltipButton);
