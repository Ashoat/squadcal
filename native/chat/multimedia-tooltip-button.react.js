// @flow

import * as React from 'react';
import Animated from 'react-native-reanimated';

import type { AppNavigationProp } from '../navigation/app-navigator.react';
import type { TooltipRoute } from '../navigation/tooltip.react';
import { useSelector } from '../redux/redux-utils';
import { InnerMultimediaMessage } from './inner-multimedia-message.react';
import { MessageHeader } from './message-header.react';

/* eslint-disable import/no-named-as-default-member */
const { Value } = Animated;
/* eslint-enable import/no-named-as-default-member */

function noop() {}

type Props = {|
  +navigation: AppNavigationProp<'MultimediaTooltipModal'>,
  +route: TooltipRoute<'MultimediaTooltipModal'>,
  +progress: Value,
|};
function MultimediaTooltipButton(props: Props): React.Node {
  const windowWidth = useSelector((state) => state.dimensions.width);
  const { progress } = props;
  const { initialCoordinates } = props.route.params;
  const headerStyle = React.useMemo(() => {
    const bottom = initialCoordinates.height;
    return {
      opacity: progress,
      position: 'absolute',
      left: -initialCoordinates.x,
      width: windowWidth,
      bottom,
    };
  }, [initialCoordinates.height, initialCoordinates.x, progress, windowWidth]);

  const { item, verticalBounds } = props.route.params;
  const { navigation } = props;
  return (
    <React.Fragment>
      <Animated.View style={headerStyle}>
        <MessageHeader item={item} focused={true} display="modal" />
      </Animated.View>
      <InnerMultimediaMessage
        item={item}
        verticalBounds={verticalBounds}
        clickable={false}
        setClickable={noop}
        onPress={navigation.goBackOnce}
        onLongPress={navigation.goBackOnce}
      />
    </React.Fragment>
  );
}

export default React.memo<Props>(MultimediaTooltipButton);
