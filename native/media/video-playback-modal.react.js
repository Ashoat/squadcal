// @flow

import invariant from 'invariant';
import * as React from 'react';
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TapGestureHandler } from 'react-native-gesture-handler';
import * as Progress from 'react-native-progress';
import Animated from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Video from 'react-native-video';

import { useIsAppBackgroundedOrInactive } from 'lib/shared/lifecycle-utils';
import type { MediaInfo } from 'lib/types/media-types';

import type { ChatMultimediaMessageInfoItem } from '../chat/multimedia-message-utils';
import ConnectedStatusBar from '../connected-status-bar.react';
import type { AppNavigationProp } from '../navigation/app-navigator.react';
import { OverlayContext } from '../navigation/overlay-context';
import type { NavigationRoute } from '../navigation/route-names';
import { useSelector } from '../redux/redux-utils';
import { derivedDimensionsInfoSelector } from '../selectors/dimensions-selectors';
import { useStyles } from '../themes/colors';
import type { VerticalBounds, LayoutCoordinates } from '../types/layout-types';
import type { NativeMethods } from '../types/react-native';
import { gestureJustEnded, animateTowards } from '../utils/animation-utils';
import { formatDuration } from './video-utils';

type TouchableOpacityInstance = React.AbstractComponent<
  React.ElementConfig<typeof TouchableOpacity>,
  NativeMethods,
>;

/* eslint-disable import/no-named-as-default-member */
const {
  Extrapolate,
  and,
  or,
  block,
  cond,
  eq,
  ceil,
  call,
  set,
  add,
  sub,
  multiply,
  divide,
  not,
  max,
  min,
  lessThan,
  greaterThan,
  abs,
  interpolate,
  useValue,
  event,
} = Animated;

export type VideoPlaybackModalParams = {|
  +presentedFrom: string,
  +mediaInfo: MediaInfo,
  +initialCoordinates: LayoutCoordinates,
  +verticalBounds: VerticalBounds,
  +item: ChatMultimediaMessageInfoItem,
|};

type Props = {|
  +navigation: AppNavigationProp<'VideoPlaybackModal'>,
  +route: NavigationRoute<'VideoPlaybackModal'>,
|};
function VideoPlaybackModal(props: Props) {
  const { mediaInfo } = props.route.params;

  const closeButtonX = useValue(-1);
  const closeButtonY = useValue(-1);
  const closeButtonWidth = useValue(-1);
  const closeButtonHeight = useValue(-1);
  const closeButtonRef = React.useRef<?React.ElementRef<TouchableOpacityInstance>>();
  const closeButton = closeButtonRef.current;
  const onCloseButtonLayoutCalledRef = React.useRef(false);
  const onCloseButtonLayout = React.useCallback(() => {
    onCloseButtonLayoutCalledRef.current = true;
  }, []);
  const onCloseButtonLayoutCalled = onCloseButtonLayoutCalledRef.current;
  React.useEffect(() => {
    if (!closeButton || !onCloseButtonLayoutCalled) {
      return;
    }
    closeButton.measure((x, y, width, height, pageX, pageY) => {
      closeButtonX.setValue(pageX);
      closeButtonY.setValue(pageY);
      closeButtonWidth.setValue(width);
      closeButtonHeight.setValue(height);
    });
  }, [
    closeButton,
    onCloseButtonLayoutCalled,
    closeButtonX,
    closeButtonY,
    closeButtonWidth,
    closeButtonHeight,
  ]);

  const footerX = useValue(-1);
  const footerY = useValue(-1);
  const footerWidth = useValue(-1);
  const footerHeight = useValue(-1);
  const footerRef = React.useRef();
  const footer = footerRef.current;
  const onFooterLayoutCalledRef = React.useRef(false);
  const onFooterLayout = React.useCallback(() => {
    onFooterLayoutCalledRef.current = true;
  }, []);
  const onFooterLayoutCalled = onFooterLayoutCalledRef.current;
  React.useEffect(() => {
    if (!footer || !onFooterLayoutCalled) {
      return;
    }
    footer.measure((x, y, width, height, pageX, pageY) => {
      footerX.setValue(pageX);
      footerY.setValue(pageY);
      footerWidth.setValue(width);
      footerHeight.setValue(height);
    });
  }, [
    footer,
    onFooterLayoutCalled,
    footerX,
    footerY,
    footerWidth,
    footerHeight,
  ]);

  const controlsShowing = useValue(1);
  const outsideButtons = React.useCallback(
    (x, y) =>
      and(
        or(
          eq(controlsShowing, 0),
          lessThan(x, Animated.debug('closeButtonX', closeButtonX)),
          greaterThan(x, add(closeButtonX, closeButtonWidth)),
          lessThan(y, closeButtonY),
          greaterThan(y, add(closeButtonY, closeButtonHeight)),
        ),
        or(
          eq(controlsShowing, 0),
          lessThan(x, Animated.debug('footerX', footerX)),
          greaterThan(x, add(footerX, footerWidth)),
          lessThan(y, footerY),
          greaterThan(y, add(footerY, footerHeight)),
        ),
      ),
    [
      controlsShowing,
      closeButtonX,
      closeButtonY,
      closeButtonWidth,
      closeButtonHeight,
      footerX,
      footerY,
      footerWidth,
      footerHeight,
    ],
  );

  /* ===== START FADE CONTROL ANIMATION ===== */

  const singleTapState = useValue(-1);
  const singleTapX = useValue(0);
  const singleTapY = useValue(0);

  const singleTapEvent = React.useCallback(
    event([
      {
        nativeEvent: {
          state: singleTapState,
          x: singleTapX,
          y: singleTapY,
        },
      },
    ]),
    [],
  );

  const lastTapX = useValue(-1);
  const lastTapY = useValue(-1);

  const activeControlsOpacity = React.useMemo(
    () =>
      animateTowards(
        [
          cond(
            and(
              gestureJustEnded(singleTapState),
              outsideButtons(lastTapX, lastTapY),
            ),
            set(controlsShowing, not(controlsShowing)),
          ),
          set(lastTapX, singleTapX),
          set(lastTapY, singleTapY),
          controlsShowing,
        ],
        150,
      ),
    [
      singleTapState,
      controlsShowing,
      outsideButtons,
      lastTapX,
      lastTapY,
      singleTapX,
      singleTapY,
    ],
  );

  const [controlsEnabled, setControlsEnabled] = React.useState(true);
  const enableControls = React.useCallback(() => setControlsEnabled(true), []);
  const disableControls = React.useCallback(
    () => setControlsEnabled(false),
    [],
  );

  const previousOpacityCeiling = useValue(-1);
  const opacityCeiling = React.useMemo(() => ceil(activeControlsOpacity), [
    activeControlsOpacity,
  ]);

  const opacityJustChanged = React.useMemo(
    () =>
      cond(eq(previousOpacityCeiling, opacityCeiling), 0, [
        set(previousOpacityCeiling, opacityCeiling),
        1,
      ]),
    [previousOpacityCeiling, opacityCeiling],
  );

  const toggleControls = React.useMemo(
    () => [
      cond(
        and(eq(opacityJustChanged, 1), eq(opacityCeiling, 0)),
        call([], disableControls),
      ),
      cond(
        and(eq(opacityJustChanged, 1), eq(opacityCeiling, 1)),
        call([], enableControls),
      ),
    ],
    [opacityJustChanged, opacityCeiling, disableControls, enableControls],
  );

  /* ===== END FADE CONTROL ANIMATION ===== */

  const mediaDimensions = mediaInfo.dimensions;
  const screenDimensions = useSelector(derivedDimensionsInfoSelector);

  const frame = React.useMemo(
    () => ({
      width: screenDimensions.width,
      height: screenDimensions.safeAreaHeight,
    }),
    [screenDimensions],
  );

  const mediaDisplayDimensions = React.useMemo(() => {
    let { height: maxHeight, width: maxWidth } = frame;
    if (maxHeight > maxWidth) {
      maxHeight -= 100;
    } else {
      maxWidth -= 100;
    }

    if (
      mediaDimensions.height < maxHeight &&
      mediaDimensions.width < maxWidth
    ) {
      return mediaDimensions;
    }

    const heightRatio = maxHeight / mediaDimensions.height;
    const widthRatio = maxWidth / mediaDimensions.width;

    if (heightRatio < widthRatio) {
      return {
        height: maxHeight,
        width: mediaDimensions.width * heightRatio,
      };
    } else {
      return {
        width: maxWidth,
        height: mediaDimensions.height * widthRatio,
      };
    }
  }, [frame, mediaDimensions]);

  const centerX = useValue(frame.width / 2);
  const centerY = useValue(frame.height / 2 + screenDimensions.topInset);
  const frameWidth = useValue(frame.width);
  const frameHeight = useValue(frame.height);
  const imageWidth = useValue(mediaDisplayDimensions.width);
  const imageHeight = useValue(mediaDisplayDimensions.height);

  React.useEffect(() => {
    const { width: frameW, height: frameH } = frame;
    const { topInset } = screenDimensions;
    frameWidth.setValue(frameW);
    frameHeight.setValue(frameH);

    centerX.setValue(frameW / 2);
    centerY.setValue(frameH / 2 + topInset);

    const { width, height } = mediaDisplayDimensions;
    imageWidth.setValue(width);
    imageHeight.setValue(height);
  }, [
    screenDimensions,
    frame,
    mediaDisplayDimensions,
    frameWidth,
    frameHeight,
    centerX,
    centerY,
    imageWidth,
    imageHeight,
  ]);

  const left = React.useMemo(() => sub(centerX, divide(imageWidth, 2)), [
    centerX,
    imageWidth,
  ]);
  const top = React.useMemo(() => sub(centerY, divide(imageHeight, 2)), [
    centerY,
    imageHeight,
  ]);

  const { initialCoordinates } = props.route.params;

  const initialScale = React.useMemo(
    () => divide(initialCoordinates.width, imageWidth),
    [initialCoordinates, imageWidth],
  );

  const initialTranslateX = React.useMemo(
    () =>
      sub(
        initialCoordinates.x + initialCoordinates.width / 2,
        add(left, divide(imageWidth, 2)),
      ),
    [initialCoordinates, left, imageWidth],
  );

  const initialTranslateY = React.useMemo(
    () =>
      sub(
        initialCoordinates.y + initialCoordinates.height / 2,
        add(top, divide(imageHeight, 2)),
      ),
    [initialCoordinates, top, imageHeight],
  );

  // The all-important outputs
  const curScale = useValue(1);
  const curX = useValue(0);
  const curY = useValue(0);
  const curBackdropOpacity = useValue(1);

  const progressiveOpacity = React.useMemo(
    () =>
      max(
        min(
          sub(1, abs(divide(curX, frameWidth))),
          sub(1, abs(divide(curY, frameHeight))),
        ),
        0,
      ),
    [curX, curY, frameWidth, frameHeight],
  );

  const updates = React.useMemo(
    () => [toggleControls, set(curBackdropOpacity, progressiveOpacity)],
    [curBackdropOpacity, progressiveOpacity, toggleControls],
  );
  const updatedScale = React.useMemo(() => [updates, curScale], [
    updates,
    curScale,
  ]);
  const updatedCurX = React.useMemo(() => [updates, curX], [updates, curX]);
  const updatedCurY = React.useMemo(() => [updates, curY], [updates, curY]);
  const updatedBackdropOpacity = React.useMemo(
    () => [updates, curBackdropOpacity],
    [updates, curBackdropOpacity],
  );

  const updatedActiveControlsOpacity = React.useMemo(
    () => block([updates, activeControlsOpacity]),
    [updates, activeControlsOpacity],
  );

  const overlayContext = React.useContext(OverlayContext);
  invariant(overlayContext, 'VideoPlaybackModal should have OverlayContext');
  const navigationProgress = overlayContext.position;

  const reverseNavigationProgress = React.useMemo(
    () => sub(1, navigationProgress),
    [navigationProgress],
  );

  const dismissalButtonOpacity = interpolate(updatedBackdropOpacity, {
    inputRange: [0.95, 1],
    outputRange: [0, 1],
    extrapolate: Extrapolate.CLAMP,
  });
  const controlsOpacity = multiply(
    navigationProgress,
    dismissalButtonOpacity,
    updatedActiveControlsOpacity,
  );

  const scale = React.useMemo(
    () =>
      add(
        multiply(reverseNavigationProgress, initialScale),
        multiply(navigationProgress, updatedScale),
      ),
    [reverseNavigationProgress, initialScale, navigationProgress, updatedScale],
  );

  const x = React.useMemo(
    () =>
      add(
        multiply(reverseNavigationProgress, initialTranslateX),
        multiply(navigationProgress, updatedCurX),
      ),
    [
      reverseNavigationProgress,
      initialTranslateX,
      navigationProgress,
      updatedCurX,
    ],
  );

  const y = React.useMemo(
    () =>
      add(
        multiply(reverseNavigationProgress, initialTranslateY),
        multiply(navigationProgress, updatedCurY),
      ),
    [
      reverseNavigationProgress,
      initialTranslateY,
      navigationProgress,
      updatedCurY,
    ],
  );

  const backdropOpacity = React.useMemo(
    () => multiply(navigationProgress, updatedBackdropOpacity),
    [navigationProgress, updatedBackdropOpacity],
  );

  const imageContainerOpacity = React.useMemo(
    () =>
      interpolate(navigationProgress, {
        inputRange: [0, 0.1],
        outputRange: [0, 1],
        extrapolate: Extrapolate.CLAMP,
      }),
    [navigationProgress],
  );

  const { verticalBounds } = props.route.params;
  const videoContainerStyle = React.useMemo(() => {
    const { height, width } = mediaDisplayDimensions;
    const { height: frameH, width: frameW } = frame;

    return {
      height,
      width,
      marginTop:
        (frameH - height) / 2 + screenDimensions.topInset - verticalBounds.y,
      marginLeft: (frameW - width) / 2,
      opacity: imageContainerOpacity,
      transform: [{ translateX: x }, { translateY: y }, { scale: scale }],
    };
  }, [
    mediaDisplayDimensions,
    frame,
    screenDimensions.topInset,
    verticalBounds.y,
    imageContainerOpacity,
    x,
    y,
    scale,
  ]);

  const styles = useStyles(unboundStyles);

  const [paused, setPaused] = useState(false);
  const [percentElapsed, setPercentElapsed] = useState(0);
  const [spinnerVisible, setSpinnerVisible] = useState(true);
  const [timeElapsed, setTimeElapsed] = useState('0:00');
  const [totalDuration, setTotalDuration] = useState('0:00');
  const videoRef = React.useRef();

  const backgroundedOrInactive = useIsAppBackgroundedOrInactive();
  React.useEffect(() => {
    if (backgroundedOrInactive) {
      setPaused(true);
      controlsShowing.setValue(1);
    }
  }, [backgroundedOrInactive, controlsShowing]);

  const {
    navigation,
    route: {
      params: {
        mediaInfo: { uri: videoUri },
      },
    },
  } = props;

  const togglePlayback = React.useCallback(() => {
    setPaused(!paused);
  }, [paused]);

  const resetVideo = React.useCallback(() => {
    invariant(videoRef.current, 'videoRef.current should be set in resetVideo');
    videoRef.current.seek(0);
  }, []);

  const progressCallback = React.useCallback((res) => {
    setTimeElapsed(formatDuration(res.currentTime));
    setTotalDuration(formatDuration(res.seekableDuration));
    setPercentElapsed(
      Math.ceil((res.currentTime / res.seekableDuration) * 100),
    );
  }, []);

  const readyForDisplayCallback = React.useCallback(() => {
    setSpinnerVisible(false);
  }, []);

  const statusBar = overlayContext.isDismissing ? null : (
    <ConnectedStatusBar hidden />
  );

  const backdropStyle = React.useMemo(() => ({ opacity: backdropOpacity }), [
    backdropOpacity,
  ]);

  const contentContainerStyle = React.useMemo(() => {
    const fullScreenHeight = screenDimensions.height;
    const bottom = fullScreenHeight - verticalBounds.y - verticalBounds.height;

    // margin will clip, but padding won't
    const verticalStyle = overlayContext.isDismissing
      ? { marginTop: verticalBounds.y, marginBottom: bottom }
      : { paddingTop: verticalBounds.y, paddingBottom: bottom };
    return [styles.contentContainer, verticalStyle];
  }, [
    screenDimensions.height,
    verticalBounds.y,
    verticalBounds.height,
    overlayContext.isDismissing,
    styles.contentContainer,
  ]);

  const controls = (
    <Animated.View
      style={[styles.controls, { opacity: controlsOpacity }]}
      pointerEvents={controlsEnabled ? 'box-none' : 'none'}
    >
      <View style={styles.header}>
        <View style={styles.closeButton}>
          <TouchableOpacity
            onPress={navigation.goBackOnce}
            ref={(closeButtonRef: any)}
            onLayout={onCloseButtonLayout}
          >
            <Icon name="close" size={30} style={styles.iconButton} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.footer} ref={footerRef} onLayout={onFooterLayout}>
        <TouchableOpacity
          onPress={togglePlayback}
          style={styles.playPauseButton}
        >
          <Icon
            name={paused ? 'play' : 'pause'}
            size={28}
            style={styles.iconButton}
          />
        </TouchableOpacity>
        <View style={styles.progressBar}>
          <Progress.Bar
            progress={percentElapsed / 100}
            height={4}
            width={null}
            color={styles.progressBar.color}
            style={styles.expand}
          />
        </View>
        <Text style={styles.durationText}>
          {timeElapsed} / {totalDuration}
        </Text>
      </View>
    </Animated.View>
  );

  let spinner;
  if (spinnerVisible) {
    spinner = (
      <Progress.Circle
        size={80}
        indeterminate={true}
        color="white"
        style={styles.progressCircle}
      />
    );
  }

  return (
    <TapGestureHandler onHandlerStateChange={singleTapEvent} minPointers={1}>
      <Animated.View style={styles.expand}>
        {statusBar}
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <View style={contentContainerStyle}>
          {spinner}
          <Animated.View style={videoContainerStyle}>
            <Video
              source={{ uri: videoUri }}
              ref={videoRef}
              style={styles.backgroundVideo}
              paused={paused}
              onProgress={progressCallback}
              onEnd={resetVideo}
              onReadyForDisplay={readyForDisplayCallback}
            />
          </Animated.View>
        </View>
        {controls}
      </Animated.View>
    </TapGestureHandler>
  );
}

const unboundStyles = {
  expand: {
    flex: 1,
  },
  backgroundVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(52,52,52,0.6)',
    height: 76,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  playPauseButton: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    paddingTop: 10,
    paddingRight: 20,
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexDirection: 'row',
    height: 100,
  },
  progressBar: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    paddingRight: 10,
    display: 'flex',
    flexDirection: 'row',
  },
  progressCircle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  iconButton: {
    marginHorizontal: 10,
    color: 'white',
  },
  durationText: {
    color: 'white',
    fontSize: 11,
    width: 70,
  },
  backdrop: {
    backgroundColor: 'black',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
};

export default VideoPlaybackModal;
