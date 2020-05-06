// @flow

import type {
  NavigationStackProp,
  NavigationLeafRoute,
} from 'react-navigation';
import type { AppState } from '../redux/redux-setup';

import * as React from 'react';
import { View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import invariant from 'invariant';

import { connect } from 'lib/utils/redux-utils';

import { contentBottomOffset } from '../selectors/dimension-selectors';
import { overlayStyleSelector, type StyleSheetOf } from '../themes/colors';
import { connectNav, type NavContextType } from './navigation-context';
import { OverlayContext } from './overlay-navigator.react';

/* eslint-disable import/no-named-as-default-member */
const { Extrapolate, interpolate } = Animated;
/* eslint-enable import/no-named-as-default-member */

type NavProp = NavigationStackProp<{|
  ...NavigationLeafRoute,
  params: {|
    message: string,
    preventPresses: true,
  |},
|}>;

type Props = {|
  navigation: NavProp,
  // Redux state
  styles: StyleSheetOf<typeof styles>,
|};
function ActionResultModal(props: Props) {
  const overlayContext = React.useContext(OverlayContext);
  invariant(overlayContext, 'ActionResultModal should have OverlayContext');
  const { position, routeIndex } = overlayContext;
  const progress = React.useMemo(
    () =>
      interpolate(position, {
        inputRange: [routeIndex - 1, routeIndex],
        outputRange: [0, 1],
        extrapolate: Extrapolate.CLAMP,
      }),
    [position, routeIndex],
  );

  // Timer resets whenever message updates
  const { state, goBack } = props.navigation;
  const { message } = state.params;
  React.useEffect(() => {
    const timeoutID = setTimeout(goBack, 2000);
    return () => clearTimeout(timeoutID);
  }, [message, goBack]);

  const containerStyle = {
    ...props.styles.container,
    opacity: progress,
  };
  return (
    <Animated.View style={containerStyle}>
      <View style={props.styles.message}>
        <View style={props.styles.backdrop} />
        <Text style={props.styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = {
  backdrop: {
    backgroundColor: 'modalContrastBackground',
    bottom: 0,
    left: 0,
    opacity: 'modalContrastOpacity',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: contentBottomOffset + 100,
  },
  message: {
    borderRadius: 10,
    overflow: 'hidden',
    padding: 10,
  },
  text: {
    color: 'modalContrastForegroundLabel',
    fontSize: 20,
    textAlign: 'center',
  },
};
const stylesSelector = overlayStyleSelector(styles);

export default connectNav((context: ?NavContextType) => ({
  navContext: context,
}))(
  connect((state: AppState, ownProps: { navContext: ?NavContextType }) => ({
    styles: stylesSelector({
      redux: state,
      navContext: ownProps.navContext,
    }),
  }))(ActionResultModal),
);
