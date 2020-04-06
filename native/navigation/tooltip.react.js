// @flow

import type {
  NavigationLeafRoute,
  NavigationStackProp,
  NavigationStackScene,
  NavigationStackTransitionProps,
} from 'react-navigation-stack';
import {
  type VerticalBounds,
  verticalBoundsPropType,
  type LayoutCoordinates,
  layoutCoordinatesPropType,
} from '../types/layout-types';
import type { AppState } from '../redux/redux-setup';
import { type Dimensions, dimensionsPropType } from 'lib/types/media-types';
import type { ViewStyle } from '../types/styles';
import type { TooltipEntry } from './tooltip-item.react';
import type { Dispatch } from 'lib/types/redux-types';
import type {
  DispatchActionPayload,
  DispatchActionPromise,
  ActionFunc,
} from 'lib/utils/action-utils';

import * as React from 'react';
import Animated from 'react-native-reanimated';
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import PropTypes from 'prop-types';

import {
  type ServerCallState,
  serverCallStatePropType,
  serverCallStateSelector,
  connect,
} from 'lib/utils/redux-utils';
import { createBoundServerCallsSelector } from 'lib/utils/action-utils';

import {
  contentBottomOffset,
  dimensionsSelector,
} from '../selectors/dimension-selectors';
import TooltipItem from './tooltip-item.react';

const { Value, Extrapolate, add, multiply, interpolate } = Animated;

type TooltipSpec<CustomProps> = {|
  entries: $ReadOnlyArray<TooltipEntry<CustomProps>>,
  labelStyle?: ViewStyle,
|};

type NavProp<CustomProps> = NavigationStackProp<{|
  ...NavigationLeafRoute,
  params: {
    ...$Exact<CustomProps>,
    presentedFrom: string,
    initialCoordinates: LayoutCoordinates,
    verticalBounds: VerticalBounds,
    location?: 'above' | 'below',
    margin?: number,
    visibleEntryIDs?: $ReadOnlyArray<string>,
  },
|}>;

type ButtonProps<Navigation> = {
  navigation: Navigation,
  progress: Value,
};

type TooltipProps<Navigation> = {
  navigation: Navigation,
  scene: NavigationStackScene,
  transitionProps: NavigationStackTransitionProps,
  position: Value,
  // Redux state
  screenDimensions: Dimensions,
  serverCallState: ServerCallState,
  // Redux dispatch functions
  dispatch: Dispatch,
  dispatchActionPayload: DispatchActionPayload,
  dispatchActionPromise: DispatchActionPromise,
};
function createTooltip<
  CustomProps: {},
  Navigation: NavProp<CustomProps>,
  TooltipPropsType: TooltipProps<Navigation>,
  ButtonComponentType: React.ComponentType<ButtonProps<Navigation>>,
>(ButtonComponent: ButtonComponentType, tooltipSpec: TooltipSpec<CustomProps>) {
  class Tooltip extends React.PureComponent<TooltipPropsType> {
    static propTypes = {
      navigation: PropTypes.shape({
        state: PropTypes.shape({
          params: PropTypes.shape({
            initialCoordinates: layoutCoordinatesPropType.isRequired,
            verticalBounds: verticalBoundsPropType.isRequired,
            location: PropTypes.oneOf(['above', 'below']),
            margin: PropTypes.number,
            visibleEntryIDs: PropTypes.arrayOf(PropTypes.string),
          }).isRequired,
        }).isRequired,
        goBack: PropTypes.func.isRequired,
      }).isRequired,
      transitionProps: PropTypes.object.isRequired,
      scene: PropTypes.object.isRequired,
      position: PropTypes.instanceOf(Value).isRequired,
      screenDimensions: dimensionsPropType.isRequired,
      serverCallState: serverCallStatePropType.isRequired,
      dispatch: PropTypes.func.isRequired,
      dispatchActionPayload: PropTypes.func.isRequired,
      dispatchActionPromise: PropTypes.func.isRequired,
    };
    progress: Value;
    backdropOpacity: Value;
    tooltipContainerOpacity: Value;
    tooltipVerticalAbove: Value;
    tooltipVerticalBelow: Value;
    tooltipHorizontalOffset = new Animated.Value(0);
    tooltipHorizontal: Value;

    constructor(props: TooltipPropsType) {
      super(props);

      const { position } = props;
      const { index } = props.scene;
      this.progress = interpolate(position, {
        inputRange: [index - 1, index],
        outputRange: [0, 1],
        extrapolate: Extrapolate.CLAMP,
      });
      this.backdropOpacity = interpolate(this.progress, {
        inputRange: [0, 1],
        outputRange: [0, 0.7],
        extrapolate: Extrapolate.CLAMP,
      });
      this.tooltipContainerOpacity = interpolate(this.progress, {
        inputRange: [0, 0.1],
        outputRange: [0, 1],
        extrapolate: Extrapolate.CLAMP,
      });

      const { margin } = this;
      this.tooltipVerticalAbove = interpolate(this.progress, {
        inputRange: [0, 1],
        outputRange: [margin + this.tooltipHeight / 2, 0],
        extrapolate: Extrapolate.CLAMP,
      });
      this.tooltipVerticalBelow = interpolate(this.progress, {
        inputRange: [0, 1],
        outputRange: [-margin - this.tooltipHeight / 2, 0],
        extrapolate: Extrapolate.CLAMP,
      });

      this.tooltipHorizontal = multiply(
        add(1, multiply(-1, this.progress)),
        this.tooltipHorizontalOffset,
      );
    }

    get entries() {
      const { entries } = tooltipSpec;
      const { visibleEntryIDs } = this.props.navigation.state.params;
      if (!visibleEntryIDs) {
        return entries;
      }
      const visibleSet = new Set(visibleEntryIDs);
      return entries.filter(entry => visibleSet.has(entry.id));
    }

    get tooltipHeight(): number {
      return tooltipHeight(this.entries.length);
    }

    get location(): 'above' | 'below' {
      const { params } = this.props.navigation.state;
      const { location } = params;
      if (location) {
        return location;
      }

      const { initialCoordinates, verticalBounds } = params;
      const { y, height } = initialCoordinates;
      const contentTop = y;
      const contentBottom = y + height;
      const boundsTop = verticalBounds.y;
      const boundsBottom = verticalBounds.y + verticalBounds.height;

      const { margin, tooltipHeight: curTooltipHeight } = this;
      const fullHeight = curTooltipHeight + margin;
      if (
        contentBottom + fullHeight > boundsBottom &&
        contentTop - fullHeight > boundsTop
      ) {
        return 'above';
      }

      return 'below';
    }

    get opacityStyle() {
      return {
        ...styles.backdrop,
        opacity: this.backdropOpacity,
      };
    }

    get contentContainerStyle() {
      const { verticalBounds } = this.props.navigation.state.params;
      const fullScreenHeight =
        this.props.screenDimensions.height + contentBottomOffset;
      const top = verticalBounds.y;
      const bottom =
        fullScreenHeight - verticalBounds.y - verticalBounds.height;
      return {
        ...styles.contentContainer,
        marginTop: top,
        marginBottom: bottom,
      };
    }

    get buttonStyle() {
      const { params } = this.props.navigation.state;
      const { initialCoordinates, verticalBounds } = params;
      const { x, y, width, height } = initialCoordinates;
      return {
        width,
        height,
        marginTop: y - verticalBounds.y,
        marginLeft: x,
      };
    }

    get margin() {
      const customMargin = this.props.navigation.state.params.margin;
      return customMargin !== null && customMargin !== undefined
        ? customMargin
        : 20;
    }

    get tooltipContainerStyle() {
      const { screenDimensions, navigation } = this.props;
      const { initialCoordinates, verticalBounds } = navigation.state.params;
      const { x, y, width, height } = initialCoordinates;
      const { margin, location } = this;

      const style: ViewStyle = {
        position: 'absolute',
        alignItems: 'center',
        opacity: this.tooltipContainerOpacity,
        transform: [{ translateX: this.tooltipHorizontal }],
      };

      const extraLeftSpace = x;
      const extraRightSpace = screenDimensions.width - width - x;
      if (extraLeftSpace < extraRightSpace) {
        style.left = 0;
        style.minWidth = width + 2 * extraLeftSpace;
      } else {
        style.right = 0;
        style.minWidth = width + 2 * extraRightSpace;
      }

      if (location === 'above') {
        const fullScreenHeight = screenDimensions.height + contentBottomOffset;
        style.bottom =
          fullScreenHeight - Math.max(y, verticalBounds.y) + margin;
        style.transform.push({ translateY: this.tooltipVerticalAbove });
      } else {
        style.top =
          Math.min(y + height, verticalBounds.y + verticalBounds.height) +
          margin;
        style.transform.push({ translateY: this.tooltipVerticalBelow });
      }
      style.transform.push({ scale: this.progress });
      return style;
    }

    render() {
      const { navigation, screenDimensions } = this.props;

      const { entries } = this;
      const items = entries.map((entry, index) => {
        const style = index !== entries.length - 1 ? styles.itemMargin : null;
        return (
          <TooltipItem
            key={index}
            spec={entry}
            onPress={this.onPressEntry}
            containerStyle={style}
            labelStyle={tooltipSpec.labelStyle}
          />
        );
      });

      let triangleStyle;
      const { initialCoordinates } = navigation.state.params;
      const { x, width } = initialCoordinates;
      const extraLeftSpace = x;
      const extraRightSpace = screenDimensions.width - width - x;
      if (extraLeftSpace < extraRightSpace) {
        triangleStyle = {
          alignSelf: 'flex-start',
          left: extraLeftSpace + (width - 20) / 2,
        };
      } else {
        triangleStyle = {
          alignSelf: 'flex-end',
          right: extraRightSpace + (width - 20) / 2,
        };
      }

      let triangleDown = null;
      let triangleUp = null;
      const { location } = this;
      if (location === 'above') {
        triangleDown = <View style={[styles.triangleDown, triangleStyle]} />;
      } else {
        triangleUp = <View style={[styles.triangleUp, triangleStyle]} />;
      }

      return (
        <TouchableWithoutFeedback onPress={this.onPressBackdrop}>
          <View style={styles.container}>
            <Animated.View style={this.opacityStyle} />
            <View style={this.contentContainerStyle}>
              <View style={this.buttonStyle}>
                <ButtonComponent
                  navigation={navigation}
                  progress={this.progress}
                />
              </View>
            </View>
            <Animated.View
              style={this.tooltipContainerStyle}
              onLayout={this.onTooltipContainerLayout}
            >
              {triangleUp}
              <View style={styles.items}>{items}</View>
              {triangleDown}
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      );
    }

    onPressBackdrop = () => {
      this.props.navigation.goBack();
    };

    onPressEntry = (entry: TooltipEntry<CustomProps>) => {
      const {
        initialCoordinates,
        verticalBounds,
        location,
        margin,
        visibleEntryIDs,
        ...customProps
      } = this.props.navigation.state.params;
      this.props.navigation.goBack();
      const dispatchFunctions = {
        dispatch: this.props.dispatch,
        dispatchActionPayload: this.props.dispatchActionPayload,
        dispatchActionPromise: this.props.dispatchActionPromise,
      };
      entry.onPress(customProps, dispatchFunctions, this.bindServerCall);
    };

    bindServerCall = (serverCall: ActionFunc) => {
      const {
        cookie,
        urlPrefix,
        sessionID,
        currentUserInfo,
        connectionStatus,
      } = this.props.serverCallState;
      return createBoundServerCallsSelector(serverCall)({
        dispatch: this.props.dispatch,
        cookie,
        urlPrefix,
        sessionID,
        currentUserInfo,
        connectionStatus,
      });
    };

    onTooltipContainerLayout = (event: {
      nativeEvent: { layout: { x: number, width: number } },
    }) => {
      const { navigation, screenDimensions } = this.props;
      const { x, width } = navigation.state.params.initialCoordinates;

      const extraLeftSpace = x;
      const extraRightSpace = screenDimensions.width - width - x;

      const actualWidth = event.nativeEvent.layout.width;
      if (extraLeftSpace < extraRightSpace) {
        const minWidth = width + 2 * extraLeftSpace;
        this.tooltipHorizontalOffset.setValue((minWidth - actualWidth) / 2);
      } else {
        const minWidth = width + 2 * extraRightSpace;
        this.tooltipHorizontalOffset.setValue((actualWidth - minWidth) / 2);
      }
    };
  }
  return connect(
    (state: AppState) => ({
      screenDimensions: dimensionsSelector(state),
      serverCallState: serverCallStateSelector(state),
    }),
    null,
    true,
  )(Tooltip);
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'black',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  itemMargin: {
    borderBottomColor: '#E1E1E1',
    borderBottomWidth: 1,
  },
  items: {
    backgroundColor: 'white',
    borderRadius: 5,
    overflow: 'hidden',
  },
  triangleDown: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 0,
    borderLeftColor: 'transparent',
    borderLeftWidth: 10,
    borderRightColor: 'transparent',
    borderRightWidth: 10,
    borderStyle: 'solid',
    borderTopColor: 'white',
    borderTopWidth: 10,
    height: 10,
    top: Platform.OS === 'android' ? -1 : 0,
    width: 10,
  },
  triangleUp: {
    borderBottomColor: 'white',
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderLeftWidth: 10,
    borderRightColor: 'transparent',
    borderRightWidth: 10,
    borderStyle: 'solid',
    borderTopColor: 'transparent',
    borderTopWidth: 0,
    bottom: Platform.OS === 'android' ? -1 : 0,
    height: 10,
    width: 10,
  },
});

function tooltipHeight(numEntries: number) {
  // 10 (triangle) + 37 * numEntries (entries) + numEntries - 1 (padding)
  return 9 + 38 * numEntries;
}

export { createTooltip, tooltipHeight };
