// @flow

import invariant from 'invariant';
import * as React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import {
  PinchGestureHandler,
  PanGestureHandler,
  TapGestureHandler,
  State as GestureState,
} from 'react-native-gesture-handler';
import Orientation from 'react-native-orientation-locker';
import Animated from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';

import { type MediaInfo, type Dimensions } from 'lib/types/media-types';
import { useIsReportEnabled } from 'lib/utils/report-utils';

import type { ChatMultimediaMessageInfoItem } from '../chat/multimedia-message-utils';
import ConnectedStatusBar from '../connected-status-bar.react';
import type { AppNavigationProp } from '../navigation/app-navigator.react';
import {
  OverlayContext,
  type OverlayContextType,
} from '../navigation/overlay-context';
import type { NavigationRoute } from '../navigation/route-names';
import { useSelector } from '../redux/redux-utils';
import {
  type DerivedDimensionsInfo,
  derivedDimensionsInfoSelector,
} from '../selectors/dimensions-selectors';
import {
  type VerticalBounds,
  type LayoutCoordinates,
} from '../types/layout-types';
import type { NativeMethods } from '../types/react-native';
import {
  clamp,
  gestureJustStarted,
  gestureJustEnded,
  runTiming,
} from '../utils/animation-utils';
import Multimedia from './multimedia.react';
import { intentionalSaveMedia } from './save-media';

/* eslint-disable import/no-named-as-default-member */
const {
  Value,
  Clock,
  event,
  Extrapolate,
  set,
  call,
  cond,
  not,
  and,
  or,
  eq,
  neq,
  greaterThan,
  lessThan,
  add,
  sub,
  multiply,
  divide,
  pow,
  max,
  min,
  round,
  abs,
  interpolate,
  startClock,
  stopClock,
  clockRunning,
  decay,
} = Animated;
/* eslint-enable import/no-named-as-default-member */

function scaleDelta(value: Value, gestureActive: Value) {
  const diffThisFrame = new Value(1);
  const prevValue = new Value(1);
  return cond(
    gestureActive,
    [
      set(diffThisFrame, divide(value, prevValue)),
      set(prevValue, value),
      diffThisFrame,
    ],
    set(prevValue, 1),
  );
}

function panDelta(value: Value, gestureActive: Value) {
  const diffThisFrame = new Value(0);
  const prevValue = new Value(0);
  return cond(
    gestureActive,
    [
      set(diffThisFrame, sub(value, prevValue)),
      set(prevValue, value),
      diffThisFrame,
    ],
    set(prevValue, 0),
  );
}

function runDecay(
  clock: Clock,
  velocity: Value,
  initialPosition: Value,
  startStopClock: boolean = true,
): Value {
  const state = {
    finished: new Value(0),
    velocity: new Value(0),
    position: new Value(0),
    time: new Value(0),
  };
  const config = { deceleration: 0.99 };
  return [
    cond(not(clockRunning(clock)), [
      set(state.finished, 0),
      set(state.velocity, velocity),
      set(state.position, initialPosition),
      set(state.time, 0),
      startStopClock && startClock(clock),
    ]),
    decay(clock, state, config),
    cond(state.finished, startStopClock && stopClock(clock)),
    state.position,
  ];
}

export type ImageModalParams = {|
  presentedFrom: string,
  mediaInfo: MediaInfo,
  initialCoordinates: LayoutCoordinates,
  verticalBounds: VerticalBounds,
  item: ChatMultimediaMessageInfoItem,
|};

type TouchableOpacityInstance = React.AbstractComponent<
  React.ElementConfig<typeof TouchableOpacity>,
  NativeMethods,
>;

type BaseProps = {|
  +navigation: AppNavigationProp<'ImageModal'>,
  +route: NavigationRoute<'ImageModal'>,
|};
type Props = {|
  ...BaseProps,
  // Redux state
  +dimensions: DerivedDimensionsInfo,
  // withOverlayContext
  +overlayContext: ?OverlayContextType,
  +mediaReportsEnabled: boolean,
|};
type State = {|
  +closeButtonEnabled: boolean,
  +actionLinksEnabled: boolean,
|};
class ImageModal extends React.PureComponent<Props, State> {
  state: State = {
    closeButtonEnabled: true,
    actionLinksEnabled: true,
  };

  closeButton: ?React.ElementRef<TouchableOpacityInstance>;
  saveButton: ?React.ElementRef<TouchableOpacityInstance>;
  closeButtonX = new Value(-1);
  closeButtonY = new Value(-1);
  closeButtonWidth = new Value(0);
  closeButtonHeight = new Value(0);
  closeButtonLastState = new Value(1);
  saveButtonX = new Value(-1);
  saveButtonY = new Value(-1);
  saveButtonWidth = new Value(0);
  saveButtonHeight = new Value(0);
  actionLinksLastState = new Value(1);

  centerX: Value;
  centerY: Value;
  frameWidth: Value;
  frameHeight: Value;
  imageWidth: Value;
  imageHeight: Value;

  pinchHandler = React.createRef();
  panHandler = React.createRef();
  singleTapHandler = React.createRef();
  doubleTapHandler = React.createRef();
  handlerRefs = [
    this.pinchHandler,
    this.panHandler,
    this.singleTapHandler,
    this.doubleTapHandler,
  ];
  beforeDoubleTapRefs;
  beforeSingleTapRefs;

  pinchEvent;
  panEvent;
  singleTapEvent;
  doubleTapEvent;

  scale: Value;
  x: Value;
  y: Value;
  backdropOpacity: Value;
  imageContainerOpacity: Value;
  actionLinksOpacity: Value;
  closeButtonOpacity: Value;

  constructor(props: Props) {
    super(props);
    this.updateDimensions();

    const { imageWidth, imageHeight } = this;
    const left = sub(this.centerX, divide(imageWidth, 2));
    const top = sub(this.centerY, divide(imageHeight, 2));

    const { initialCoordinates } = props.route.params;
    const initialScale = divide(initialCoordinates.width, imageWidth);
    const initialTranslateX = sub(
      initialCoordinates.x + initialCoordinates.width / 2,
      add(left, divide(imageWidth, 2)),
    );
    const initialTranslateY = sub(
      initialCoordinates.y + initialCoordinates.height / 2,
      add(top, divide(imageHeight, 2)),
    );

    const { overlayContext } = props;
    invariant(overlayContext, 'ImageModal should have OverlayContext');
    const navigationProgress = overlayContext.position;

    // The inputs we receive from PanGestureHandler
    const panState = new Value(-1);
    const panTranslationX = new Value(0);
    const panTranslationY = new Value(0);
    const panVelocityX = new Value(0);
    const panVelocityY = new Value(0);
    const panAbsoluteX = new Value(0);
    const panAbsoluteY = new Value(0);
    this.panEvent = event([
      {
        nativeEvent: {
          state: panState,
          translationX: panTranslationX,
          translationY: panTranslationY,
          velocityX: panVelocityX,
          velocityY: panVelocityY,
          absoluteX: panAbsoluteX,
          absoluteY: panAbsoluteY,
        },
      },
    ]);
    const curPanActive = new Value(0);
    const panActive = [
      cond(
        and(
          gestureJustStarted(panState),
          this.outsideButtons(
            sub(panAbsoluteX, panTranslationX),
            sub(panAbsoluteY, panTranslationY),
          ),
        ),
        set(curPanActive, 1),
      ),
      cond(gestureJustEnded(panState), set(curPanActive, 0)),
      curPanActive,
    ];
    const lastPanActive = new Value(0);
    const panJustEnded = cond(eq(lastPanActive, panActive), 0, [
      set(lastPanActive, panActive),
      eq(panActive, 0),
    ]);

    // The inputs we receive from PinchGestureHandler
    const pinchState = new Value(-1);
    const pinchScale = new Value(1);
    const pinchFocalX = new Value(0);
    const pinchFocalY = new Value(0);
    this.pinchEvent = event([
      {
        nativeEvent: {
          state: pinchState,
          scale: pinchScale,
          focalX: pinchFocalX,
          focalY: pinchFocalY,
        },
      },
    ]);
    const pinchActive = eq(pinchState, GestureState.ACTIVE);

    // The inputs we receive from single TapGestureHandler
    const singleTapState = new Value(-1);
    const singleTapX = new Value(0);
    const singleTapY = new Value(0);
    this.singleTapEvent = event([
      {
        nativeEvent: {
          state: singleTapState,
          x: singleTapX,
          y: singleTapY,
        },
      },
    ]);

    // The inputs we receive from double TapGestureHandler
    const doubleTapState = new Value(-1);
    const doubleTapX = new Value(0);
    const doubleTapY = new Value(0);
    this.doubleTapEvent = event([
      {
        nativeEvent: {
          state: doubleTapState,
          x: doubleTapX,
          y: doubleTapY,
        },
      },
    ]);

    // The all-important outputs
    const curScale = new Value(1);
    const curX = new Value(0);
    const curY = new Value(0);
    const curBackdropOpacity = new Value(1);
    const curCloseButtonOpacity = new Value(1);
    const curActionLinksOpacity = new Value(1);

    // The centered variables help us know if we need to be recentered
    const recenteredScale = max(curScale, 1);
    const horizontalPanSpace = this.horizontalPanSpace(recenteredScale);
    const verticalPanSpace = this.verticalPanSpace(recenteredScale);

    const resetXClock = new Clock();
    const resetYClock = new Clock();
    const zoomClock = new Clock();

    const dismissingFromPan = new Value(0);

    const roundedCurScale = divide(round(multiply(curScale, 1000)), 1000);
    const gestureActive = or(pinchActive, panActive);
    const activeInteraction = or(
      gestureActive,
      clockRunning(zoomClock),
      dismissingFromPan,
    );

    const updates = [
      this.pinchUpdate(
        pinchActive,
        pinchScale,
        pinchFocalX,
        pinchFocalY,
        curScale,
        curX,
        curY,
      ),
      this.panUpdate(panActive, panTranslationX, panTranslationY, curX, curY),
      this.singleTapUpdate(
        singleTapState,
        singleTapX,
        singleTapY,
        roundedCurScale,
        curCloseButtonOpacity,
        curActionLinksOpacity,
      ),
      this.doubleTapUpdate(
        doubleTapState,
        doubleTapX,
        doubleTapY,
        roundedCurScale,
        zoomClock,
        gestureActive,
        curScale,
        curX,
        curY,
      ),
      this.backdropOpacityUpdate(
        panJustEnded,
        pinchActive,
        panVelocityX,
        panVelocityY,
        curX,
        curY,
        roundedCurScale,
        curBackdropOpacity,
        dismissingFromPan,
      ),
      this.recenter(
        resetXClock,
        resetYClock,
        activeInteraction,
        recenteredScale,
        horizontalPanSpace,
        verticalPanSpace,
        curScale,
        curX,
        curY,
      ),
      this.flingUpdate(
        resetXClock,
        resetYClock,
        activeInteraction,
        panJustEnded,
        panVelocityX,
        panVelocityY,
        horizontalPanSpace,
        verticalPanSpace,
        curX,
        curY,
      ),
    ];
    const updatedScale = [updates, curScale];
    const updatedCurX = [updates, curX];
    const updatedCurY = [updates, curY];
    const updatedBackdropOpacity = [updates, curBackdropOpacity];
    const updatedCloseButtonOpacity = [updates, curCloseButtonOpacity];
    const updatedActionLinksOpacity = [updates, curActionLinksOpacity];

    const reverseNavigationProgress = sub(1, navigationProgress);
    this.scale = add(
      multiply(reverseNavigationProgress, initialScale),
      multiply(navigationProgress, updatedScale),
    );
    this.x = add(
      multiply(reverseNavigationProgress, initialTranslateX),
      multiply(navigationProgress, updatedCurX),
    );
    this.y = add(
      multiply(reverseNavigationProgress, initialTranslateY),
      multiply(navigationProgress, updatedCurY),
    );
    this.backdropOpacity = multiply(navigationProgress, updatedBackdropOpacity);
    this.imageContainerOpacity = interpolate(navigationProgress, {
      inputRange: [0, 0.1],
      outputRange: [0, 1],
      extrapolate: Extrapolate.CLAMP,
    });
    const buttonOpacity = interpolate(updatedBackdropOpacity, {
      inputRange: [0.95, 1],
      outputRange: [0, 1],
      extrapolate: Extrapolate.CLAMP,
    });
    this.closeButtonOpacity = multiply(
      navigationProgress,
      buttonOpacity,
      updatedCloseButtonOpacity,
    );
    this.actionLinksOpacity = multiply(
      navigationProgress,
      buttonOpacity,
      updatedActionLinksOpacity,
    );

    this.beforeDoubleTapRefs = Platform.select({
      android: [],
      default: [this.pinchHandler, this.panHandler],
    });
    this.beforeSingleTapRefs = [
      ...this.beforeDoubleTapRefs,
      this.doubleTapHandler,
    ];
  }

  // How much space do we have to pan the image horizontally?
  horizontalPanSpace(scale: Value) {
    const apparentWidth = multiply(this.imageWidth, scale);
    const horizPop = divide(sub(apparentWidth, this.frameWidth), 2);
    return max(horizPop, 0);
  }

  // How much space do we have to pan the image vertically?
  verticalPanSpace(scale: Value) {
    const apparentHeight = multiply(this.imageHeight, scale);
    const vertPop = divide(sub(apparentHeight, this.frameHeight), 2);
    return max(vertPop, 0);
  }

  pinchUpdate(
    // Inputs
    pinchActive: Value,
    pinchScale: Value,
    pinchFocalX: Value,
    pinchFocalY: Value,
    // Outputs
    curScale: Value,
    curX: Value,
    curY: Value,
  ): Value {
    const deltaScale = scaleDelta(pinchScale, pinchActive);
    const deltaPinchX = multiply(
      sub(1, deltaScale),
      sub(pinchFocalX, curX, this.centerX),
    );
    const deltaPinchY = multiply(
      sub(1, deltaScale),
      sub(pinchFocalY, curY, this.centerY),
    );

    return cond(
      [deltaScale, pinchActive],
      [
        set(curX, add(curX, deltaPinchX)),
        set(curY, add(curY, deltaPinchY)),
        set(curScale, multiply(curScale, deltaScale)),
      ],
    );
  }

  outsideButtons(x: Value, y: Value) {
    const {
      closeButtonX,
      closeButtonY,
      closeButtonWidth,
      closeButtonHeight,
      closeButtonLastState,
      saveButtonX,
      saveButtonY,
      saveButtonWidth,
      saveButtonHeight,
      actionLinksLastState,
    } = this;
    return and(
      or(
        eq(closeButtonLastState, 0),
        lessThan(x, closeButtonX),
        greaterThan(x, add(closeButtonX, closeButtonWidth)),
        lessThan(y, closeButtonY),
        greaterThan(y, add(closeButtonY, closeButtonHeight)),
      ),
      or(
        eq(actionLinksLastState, 0),
        lessThan(x, saveButtonX),
        greaterThan(x, add(saveButtonX, saveButtonWidth)),
        lessThan(y, saveButtonY),
        greaterThan(y, add(saveButtonY, saveButtonHeight)),
      ),
    );
  }

  panUpdate(
    // Inputs
    panActive: Value,
    panTranslationX: Value,
    panTranslationY: Value,
    // Outputs
    curX: Value,
    curY: Value,
  ): Value {
    const deltaX = panDelta(panTranslationX, panActive);
    const deltaY = panDelta(panTranslationY, panActive);
    return cond(
      [deltaX, deltaY, panActive],
      [set(curX, add(curX, deltaX)), set(curY, add(curY, deltaY))],
    );
  }

  singleTapUpdate(
    // Inputs
    singleTapState: Value,
    singleTapX: Value,
    singleTapY: Value,
    roundedCurScale: Value,
    // Outputs
    curCloseButtonOpacity: Value,
    curActionLinksOpacity: Value,
  ): Value {
    const lastTapX = new Value(0);
    const lastTapY = new Value(0);
    const fingerJustReleased = and(
      gestureJustEnded(singleTapState),
      this.outsideButtons(lastTapX, lastTapY),
    );

    const wasZoomed = new Value(0);
    const isZoomed = greaterThan(roundedCurScale, 1);
    const becameUnzoomed = and(wasZoomed, not(isZoomed));

    const closeButtonState = cond(
      or(
        fingerJustReleased,
        and(becameUnzoomed, eq(this.closeButtonLastState, 0)),
      ),
      sub(1, this.closeButtonLastState),
      this.closeButtonLastState,
    );

    const actionLinksState = cond(
      isZoomed,
      0,
      cond(
        or(fingerJustReleased, becameUnzoomed),
        sub(1, this.actionLinksLastState),
        this.actionLinksLastState,
      ),
    );

    const closeButtonAppearClock = new Clock();
    const closeButtonDisappearClock = new Clock();
    const actionLinksAppearClock = new Clock();
    const actionLinksDisappearClock = new Clock();
    return [
      fingerJustReleased,
      set(
        curCloseButtonOpacity,
        cond(
          eq(closeButtonState, 1),
          [
            stopClock(closeButtonDisappearClock),
            runTiming(closeButtonAppearClock, curCloseButtonOpacity, 1),
          ],
          [
            stopClock(closeButtonAppearClock),
            runTiming(closeButtonDisappearClock, curCloseButtonOpacity, 0),
          ],
        ),
      ),
      set(
        curActionLinksOpacity,
        cond(
          eq(actionLinksState, 1),
          [
            stopClock(actionLinksDisappearClock),
            runTiming(actionLinksAppearClock, curActionLinksOpacity, 1),
          ],
          [
            stopClock(actionLinksAppearClock),
            runTiming(actionLinksDisappearClock, curActionLinksOpacity, 0),
          ],
        ),
      ),
      set(this.actionLinksLastState, actionLinksState),
      set(this.closeButtonLastState, closeButtonState),
      set(wasZoomed, isZoomed),
      set(lastTapX, singleTapX),
      set(lastTapY, singleTapY),
      call([eq(curCloseButtonOpacity, 1)], this.setCloseButtonEnabled),
      call([eq(curActionLinksOpacity, 1)], this.setActionLinksEnabled),
    ];
  }

  doubleTapUpdate(
    // Inputs
    doubleTapState: Value,
    doubleTapX: Value,
    doubleTapY: Value,
    roundedCurScale: Value,
    zoomClock: Clock,
    gestureActive: Value,
    // Outputs
    curScale: Value,
    curX: Value,
    curY: Value,
  ): Value {
    const zoomClockRunning = clockRunning(zoomClock);
    const zoomActive = and(not(gestureActive), zoomClockRunning);
    const targetScale = cond(greaterThan(roundedCurScale, 1), 1, 3);

    const tapXDiff = sub(doubleTapX, this.centerX, curX);
    const tapYDiff = sub(doubleTapY, this.centerY, curY);
    const tapXPercent = divide(tapXDiff, this.imageWidth, curScale);
    const tapYPercent = divide(tapYDiff, this.imageHeight, curScale);

    const horizPanSpace = this.horizontalPanSpace(targetScale);
    const vertPanSpace = this.verticalPanSpace(targetScale);
    const horizPanPercent = divide(horizPanSpace, this.imageWidth, targetScale);
    const vertPanPercent = divide(vertPanSpace, this.imageHeight, targetScale);

    const tapXPercentClamped = clamp(
      tapXPercent,
      multiply(-1, horizPanPercent),
      horizPanPercent,
    );
    const tapYPercentClamped = clamp(
      tapYPercent,
      multiply(-1, vertPanPercent),
      vertPanPercent,
    );
    const targetX = multiply(tapXPercentClamped, this.imageWidth, targetScale);
    const targetY = multiply(tapYPercentClamped, this.imageHeight, targetScale);

    const targetRelativeScale = divide(targetScale, curScale);
    const targetRelativeX = multiply(-1, add(targetX, curX));
    const targetRelativeY = multiply(-1, add(targetY, curY));

    const zoomScale = runTiming(zoomClock, 1, targetRelativeScale);
    const zoomX = runTiming(zoomClock, 0, targetRelativeX, false);
    const zoomY = runTiming(zoomClock, 0, targetRelativeY, false);

    const deltaScale = scaleDelta(zoomScale, zoomActive);
    const deltaX = panDelta(zoomX, zoomActive);
    const deltaY = panDelta(zoomY, zoomActive);

    const fingerJustReleased = and(
      gestureJustEnded(doubleTapState),
      this.outsideButtons(doubleTapX, doubleTapY),
    );

    return cond(
      [fingerJustReleased, deltaX, deltaY, deltaScale, gestureActive],
      stopClock(zoomClock),
      cond(or(zoomClockRunning, fingerJustReleased), [
        zoomX,
        zoomY,
        zoomScale,
        set(curX, add(curX, deltaX)),
        set(curY, add(curY, deltaY)),
        set(curScale, multiply(curScale, deltaScale)),
      ]),
    );
  }

  backdropOpacityUpdate(
    // Inputs
    panJustEnded: Value,
    pinchActive: Value,
    panVelocityX: Value,
    panVelocityY: Value,
    curX: Value,
    curY: Value,
    roundedCurScale: Value,
    // Outputs
    curBackdropOpacity: Value,
    dismissingFromPan: Value,
  ): Value {
    const progressiveOpacity = max(
      min(
        sub(1, abs(divide(curX, this.frameWidth))),
        sub(1, abs(divide(curY, this.frameHeight))),
      ),
      0,
    );

    const resetClock = new Clock();

    const velocity = pow(add(pow(panVelocityX, 2), pow(panVelocityY, 2)), 0.5);
    const shouldGoBack = and(
      panJustEnded,
      or(greaterThan(velocity, 50), greaterThan(0.7, progressiveOpacity)),
    );

    const decayClock = new Clock();
    const decayItems = [
      set(curX, runDecay(decayClock, panVelocityX, curX, false)),
      set(curY, runDecay(decayClock, panVelocityY, curY)),
    ];

    return cond(
      [panJustEnded, dismissingFromPan],
      decayItems,
      cond(
        or(pinchActive, greaterThan(roundedCurScale, 1)),
        set(curBackdropOpacity, runTiming(resetClock, curBackdropOpacity, 1)),
        [
          stopClock(resetClock),
          set(curBackdropOpacity, progressiveOpacity),
          set(dismissingFromPan, shouldGoBack),
          cond(shouldGoBack, [decayItems, call([], this.close)]),
        ],
      ),
    );
  }

  recenter(
    // Inputs
    resetXClock: Clock,
    resetYClock: Clock,
    activeInteraction: Value,
    recenteredScale: Value,
    horizontalPanSpace: Value,
    verticalPanSpace: Value,
    // Outputs
    curScale: Value,
    curX: Value,
    curY: Value,
  ): Value {
    const resetScaleClock = new Clock();

    const recenteredX = clamp(
      curX,
      multiply(-1, horizontalPanSpace),
      horizontalPanSpace,
    );
    const recenteredY = clamp(
      curY,
      multiply(-1, verticalPanSpace),
      verticalPanSpace,
    );

    return cond(
      activeInteraction,
      [
        stopClock(resetScaleClock),
        stopClock(resetXClock),
        stopClock(resetYClock),
      ],
      [
        cond(
          or(clockRunning(resetScaleClock), neq(recenteredScale, curScale)),
          set(curScale, runTiming(resetScaleClock, curScale, recenteredScale)),
        ),
        cond(
          or(clockRunning(resetXClock), neq(recenteredX, curX)),
          set(curX, runTiming(resetXClock, curX, recenteredX)),
        ),
        cond(
          or(clockRunning(resetYClock), neq(recenteredY, curY)),
          set(curY, runTiming(resetYClock, curY, recenteredY)),
        ),
      ],
    );
  }

  flingUpdate(
    // Inputs
    resetXClock: Clock,
    resetYClock: Clock,
    activeInteraction: Value,
    panJustEnded: Value,
    panVelocityX: Value,
    panVelocityY: Value,
    horizontalPanSpace: Value,
    verticalPanSpace: Value,
    // Outputs
    curX: Value,
    curY: Value,
  ): Value {
    const flingXClock = new Clock();
    const flingYClock = new Clock();

    const decayX = runDecay(flingXClock, panVelocityX, curX);
    const recenteredX = clamp(
      decayX,
      multiply(-1, horizontalPanSpace),
      horizontalPanSpace,
    );
    const decayY = runDecay(flingYClock, panVelocityY, curY);
    const recenteredY = clamp(
      decayY,
      multiply(-1, verticalPanSpace),
      verticalPanSpace,
    );

    return cond(
      activeInteraction,
      [stopClock(flingXClock), stopClock(flingYClock)],
      [
        cond(
          clockRunning(resetXClock),
          stopClock(flingXClock),
          cond(or(panJustEnded, clockRunning(flingXClock)), [
            set(curX, recenteredX),
            cond(neq(decayX, recenteredX), stopClock(flingXClock)),
          ]),
        ),
        cond(
          clockRunning(resetYClock),
          stopClock(flingYClock),
          cond(or(panJustEnded, clockRunning(flingYClock)), [
            set(curY, recenteredY),
            cond(neq(decayY, recenteredY), stopClock(flingYClock)),
          ]),
        ),
      ],
    );
  }

  updateDimensions() {
    const { width: frameWidth, height: frameHeight } = this.frame;
    const { topInset } = this.props.dimensions;
    if (this.frameWidth) {
      this.frameWidth.setValue(frameWidth);
    } else {
      this.frameWidth = new Value(frameWidth);
    }
    if (this.frameHeight) {
      this.frameHeight.setValue(frameHeight);
    } else {
      this.frameHeight = new Value(frameHeight);
    }

    const centerX = frameWidth / 2;
    const centerY = frameHeight / 2 + topInset;
    if (this.centerX) {
      this.centerX.setValue(centerX);
    } else {
      this.centerX = new Value(centerX);
    }
    if (this.centerY) {
      this.centerY.setValue(centerY);
    } else {
      this.centerY = new Value(centerY);
    }

    const { width, height } = this.imageDimensions;
    if (this.imageWidth) {
      this.imageWidth.setValue(width);
    } else {
      this.imageWidth = new Value(width);
    }
    if (this.imageHeight) {
      this.imageHeight.setValue(height);
    } else {
      this.imageHeight = new Value(height);
    }
  }

  componentDidMount() {
    if (ImageModal.isActive(this.props)) {
      Orientation.unlockAllOrientations();
    }
  }

  componentWillUnmount() {
    if (ImageModal.isActive(this.props)) {
      Orientation.lockToPortrait();
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (this.props.dimensions !== prevProps.dimensions) {
      this.updateDimensions();
    }

    const isActive = ImageModal.isActive(this.props);
    const wasActive = ImageModal.isActive(prevProps);
    if (isActive && !wasActive) {
      Orientation.unlockAllOrientations();
    } else if (!isActive && wasActive) {
      Orientation.lockToPortrait();
    }
  }

  get frame(): Dimensions {
    const { width, safeAreaHeight } = this.props.dimensions;
    return { width, height: safeAreaHeight };
  }

  get imageDimensions(): Dimensions {
    // Make space for the close button
    let { height: maxHeight, width: maxWidth } = this.frame;
    if (maxHeight > maxWidth) {
      maxHeight -= 100;
    } else {
      maxWidth -= 100;
    }

    const { dimensions } = this.props.route.params.mediaInfo;
    if (dimensions.height < maxHeight && dimensions.width < maxWidth) {
      return dimensions;
    }

    const heightRatio = maxHeight / dimensions.height;
    const widthRatio = maxWidth / dimensions.width;
    if (heightRatio < widthRatio) {
      return {
        height: maxHeight,
        width: dimensions.width * heightRatio,
      };
    } else {
      return {
        width: maxWidth,
        height: dimensions.height * widthRatio,
      };
    }
  }

  get imageContainerStyle() {
    const { height, width } = this.imageDimensions;
    const { height: frameHeight, width: frameWidth } = this.frame;
    const top = (frameHeight - height) / 2 + this.props.dimensions.topInset;
    const left = (frameWidth - width) / 2;
    const { verticalBounds } = this.props.route.params;
    return {
      height,
      width,
      marginTop: top - verticalBounds.y,
      marginLeft: left,
      opacity: this.imageContainerOpacity,
      transform: [
        { translateX: this.x },
        { translateY: this.y },
        { scale: this.scale },
      ],
    };
  }

  static isActive(props) {
    const { overlayContext } = props;
    invariant(overlayContext, 'ImageModal should have OverlayContext');
    return !overlayContext.isDismissing;
  }

  get contentContainerStyle() {
    const { verticalBounds } = this.props.route.params;
    const fullScreenHeight = this.props.dimensions.height;
    const top = verticalBounds.y;
    const bottom = fullScreenHeight - verticalBounds.y - verticalBounds.height;

    // margin will clip, but padding won't
    const verticalStyle = ImageModal.isActive(this.props)
      ? { paddingTop: top, paddingBottom: bottom }
      : { marginTop: top, marginBottom: bottom };
    return [styles.contentContainer, verticalStyle];
  }

  render() {
    const { mediaInfo } = this.props.route.params;
    const statusBar = ImageModal.isActive(this.props) ? (
      <ConnectedStatusBar hidden />
    ) : null;
    const backdropStyle = { opacity: this.backdropOpacity };
    const closeButtonStyle = {
      opacity: this.closeButtonOpacity,
      top: Math.max(this.props.dimensions.topInset - 2, 4),
    };
    const saveButtonStyle = {
      opacity: this.actionLinksOpacity,
      bottom: this.props.dimensions.bottomInset + 8,
    };
    const view = (
      <Animated.View style={styles.container}>
        {statusBar}
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <View style={this.contentContainerStyle}>
          <Animated.View style={this.imageContainerStyle}>
            <Multimedia mediaInfo={mediaInfo} spinnerColor="white" />
          </Animated.View>
        </View>
        <Animated.View style={[styles.closeButtonContainer, closeButtonStyle]}>
          <TouchableOpacity
            onPress={this.close}
            disabled={!this.state.closeButtonEnabled}
            onLayout={this.onCloseButtonLayout}
            ref={this.closeButtonRef}
          >
            <Text style={styles.closeButton}>×</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={[styles.saveButtonContainer, saveButtonStyle]}>
          <TouchableOpacity
            onPress={this.save}
            disabled={!this.state.actionLinksEnabled}
            style={styles.saveButton}
            onLayout={this.onSaveButtonLayout}
            ref={this.saveButtonRef}
          >
            <Icon
              name={Platform.OS === 'ios' ? 'ios-save' : 'md-save'}
              style={styles.saveButtonIcon}
            />
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    );
    return (
      <PinchGestureHandler
        onGestureEvent={this.pinchEvent}
        onHandlerStateChange={this.pinchEvent}
        simultaneousHandlers={this.handlerRefs}
        ref={this.pinchHandler}
      >
        <Animated.View style={styles.container}>
          <PanGestureHandler
            onGestureEvent={this.panEvent}
            onHandlerStateChange={this.panEvent}
            simultaneousHandlers={this.handlerRefs}
            ref={this.panHandler}
            avgTouches
          >
            <Animated.View style={styles.container}>
              <TapGestureHandler
                onHandlerStateChange={this.doubleTapEvent}
                simultaneousHandlers={this.handlerRefs}
                ref={this.doubleTapHandler}
                waitFor={this.beforeDoubleTapRefs}
                numberOfTaps={2}
              >
                <Animated.View style={styles.container}>
                  <TapGestureHandler
                    onHandlerStateChange={this.singleTapEvent}
                    simultaneousHandlers={this.handlerRefs}
                    ref={this.singleTapHandler}
                    waitFor={this.beforeSingleTapRefs}
                    numberOfTaps={1}
                  >
                    {view}
                  </TapGestureHandler>
                </Animated.View>
              </TapGestureHandler>
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </PinchGestureHandler>
    );
  }

  close = () => {
    this.props.navigation.goBackOnce();
  };

  save = () => {
    const { mediaInfo, item } = this.props.route.params;
    const { id: uploadID, uri } = mediaInfo;
    const { id: messageServerID, localID: messageLocalID } = item.messageInfo;
    const ids = { uploadID, messageServerID, messageLocalID };
    return intentionalSaveMedia(uri, ids, {
      mediaReportsEnabled: this.props.mediaReportsEnabled,
    });
  };

  setCloseButtonEnabled = ([enabledNum]: [number]) => {
    const enabled = !!enabledNum;
    if (this.state.closeButtonEnabled !== enabled) {
      this.setState({ closeButtonEnabled: enabled });
    }
  };

  setActionLinksEnabled = ([enabledNum]: [number]) => {
    const enabled = !!enabledNum;
    if (this.state.actionLinksEnabled !== enabled) {
      this.setState({ actionLinksEnabled: enabled });
    }
  };

  closeButtonRef = (
    closeButton: ?React.ElementRef<typeof TouchableOpacity>,
  ) => {
    this.closeButton = (closeButton: any);
  };

  saveButtonRef = (saveButton: ?React.ElementRef<typeof TouchableOpacity>) => {
    this.saveButton = (saveButton: any);
  };

  onCloseButtonLayout = () => {
    const { closeButton } = this;
    if (!closeButton) {
      return;
    }
    closeButton.measure((x, y, width, height, pageX, pageY) => {
      this.closeButtonX.setValue(pageX);
      this.closeButtonY.setValue(pageY);
      this.closeButtonWidth.setValue(width);
      this.closeButtonHeight.setValue(height);
    });
  };

  onSaveButtonLayout = () => {
    const { saveButton } = this;
    if (!saveButton) {
      return;
    }
    saveButton.measure((x, y, width, height, pageX, pageY) => {
      this.saveButtonX.setValue(pageX);
      this.saveButtonY.setValue(pageY);
      this.saveButtonWidth.setValue(width);
      this.saveButtonHeight.setValue(height);
    });
  };
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
  closeButton: {
    color: 'white',
    fontSize: 36,
    paddingHorizontal: 8,
    paddingVertical: 2,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  closeButtonContainer: {
    position: 'absolute',
    right: 4,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  saveButton: {
    alignItems: 'center',
    paddingBottom: 2,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 2,
  },
  saveButtonContainer: {
    left: 16,
    position: 'absolute',
  },
  saveButtonIcon: {
    color: '#D7D7DC',
    fontSize: 36,
    textShadowColor: '#1C1C1E',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  saveButtonText: {
    color: '#D7D7DC',
    fontSize: 14,
    textShadowColor: '#1C1C1E',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});

export default React.memo<BaseProps>(function ConnectedImageModal(
  props: BaseProps,
) {
  const dimensions = useSelector(derivedDimensionsInfoSelector);
  const overlayContext = React.useContext(OverlayContext);
  const mediaReportsEnabled = useIsReportEnabled('mediaReports');
  return (
    <ImageModal
      {...props}
      dimensions={dimensions}
      overlayContext={overlayContext}
      mediaReportsEnabled={mediaReportsEnabled}
    />
  );
});
