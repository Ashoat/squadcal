// @flow

import type { BaseAction } from 'lib/types/redux-types';
import type { BaseNavInfo } from 'lib/types/nav-types';
import type { RawThreadInfo, LeaveThreadPayload } from 'lib/types/thread-types';
import type {
  NavigationState,
  NavigationAction,
  NavigationRoute,
  NavigationStateRoute,
} from 'react-navigation';
import type {
  NavigationStackProp,
  NavigationStackTransitionProps,
} from 'react-navigation-stack';
import type { AppState } from '../redux/redux-setup';
import type { SetSessionPayload } from 'lib/types/session-types';
import type { NotificationPressPayload } from 'lib/shared/notif-utils';
import type { AndroidNotificationActions } from '../push/reducer';
import type { UserInfo } from 'lib/types/user-types';

import { createBottomTabNavigator } from 'react-navigation-tabs';
import {
  createStackNavigator,
  StackViewTransitionConfigs,
} from 'react-navigation-stack';
import invariant from 'invariant';
import { Alert, BackHandler, Platform, Keyboard } from 'react-native';
import React from 'react';
import PropTypes from 'prop-types';
import { useScreens } from 'react-native-screens';
import hoistNonReactStatics from 'hoist-non-react-statics';

import { infoFromURL } from 'lib/utils/url-utils';
import { fifteenDaysEarlier, fifteenDaysLater } from 'lib/utils/date-utils';
import { setNewSessionActionType } from 'lib/utils/action-utils';
import {
  logOutActionTypes,
  deleteAccountActionTypes,
  logInActionTypes,
  registerActionTypes,
} from 'lib/actions/user-actions';
import {
  leaveThreadActionTypes,
  deleteThreadActionTypes,
  newThreadActionTypes,
} from 'lib/actions/thread-actions';
import { notificationPressActionType } from 'lib/shared/notif-utils';
import { threadInfoFromRawThreadInfo } from 'lib/shared/thread-utils';

import Calendar from '../calendar/calendar.react';
import Chat from '../chat/chat.react';
import More from '../more/more.react';
import LoggedOutModal from '../account/logged-out-modal.react';
import VerificationModal from '../account/verification-modal.react';
import {
  appLoggedInSelector,
  appCanRespondToBackButtonSelector,
} from './nav-selectors';
import {
  assertNavigationRouteNotLeafNode,
  getThreadIDFromParams,
} from '../utils/navigation-utils';
import {
  AppRouteName,
  TabNavigatorRouteName,
  ComposeThreadRouteName,
  DeleteThreadRouteName,
  ThreadSettingsRouteName,
  MessageListRouteName,
  VerificationModalRouteName,
  LoggedOutModalRouteName,
  MoreRouteName,
  MoreScreenRouteName,
  ChatRouteName,
  ChatThreadListRouteName,
  CalendarRouteName,
  ThreadPickerModalRouteName,
  AddUsersModalRouteName,
  CustomServerModalRouteName,
  ColorPickerModalRouteName,
  ComposeSubthreadModalRouteName,
  MultimediaModalRouteName,
  MultimediaTooltipModalRouteName,
  ActionResultModalRouteName,
  TextMessageTooltipModalRouteName,
  ThreadSettingsMemberTooltipModalRouteName,
  CameraModalRouteName,
  accountModals,
} from './route-names';
import {
  handleURLActionType,
  navigateToAppActionType,
} from '../redux/action-types';
import ThreadPickerModal from '../calendar/thread-picker-modal.react';
import AddUsersModal from '../chat/settings/add-users-modal.react';
import CustomServerModal from '../more/custom-server-modal.react';
import ColorPickerModal from '../chat/settings/color-picker-modal.react';
import ComposeSubthreadModal from '../chat/settings/compose-subthread-modal.react';
import { createOverlayNavigator } from './overlay-navigator.react';
import MultimediaModal from '../media/multimedia-modal.react';
import { MultimediaTooltipModal } from '../chat/multimedia-tooltip-modal.react';
import ChatInputStateContainer from '../chat/chat-input-state-container.react';
import OverlayableScrollViewStateContainer from './overlayable-scroll-view-state-container.react';
import KeyboardStateContainer from '../keyboard/keyboard-state-container.react';
import ActionResultModal from './action-result-modal.react';
import { TextMessageTooltipModal } from '../chat/text-message-tooltip-modal.react';
import ThreadSettingsMemberTooltipModal from '../chat/settings/thread-settings-member-tooltip-modal.react';
import CameraModal from '../media/camera-modal.react';
import TabBar from './tab-bar.react';
import { connectNav, type NavContextType } from './navigation-context';

// eslint-disable-next-line react-hooks/rules-of-hooks
useScreens();

export type NavInfo = {|
  ...$Exact<BaseNavInfo>,
  navigationState: NavigationState,
|};

const messageListRouteBase = Date.now();
let messageListRouteIndex = 0;
function getUniqueMessageListRouteKey() {
  return `${messageListRouteBase}-${messageListRouteIndex++}`;
}

export type Action =
  | BaseAction
  | NavigationAction
  | {| type: 'HANDLE_URL', payload: string |}
  | {| type: 'NAVIGATE_TO_APP', payload: null |}
  | {|
      type: 'NOTIFICATION_PRESS',
      payload: NotificationPressPayload,
    |}
  | AndroidNotificationActions
  | {| type: 'RECORD_NOTIF_PERMISSION_ALERT', time: number |}
  | {| type: 'BACKGROUND' |}
  | {| type: 'FOREGROUND' |};

const TabNavigator = createBottomTabNavigator(
  {
    [CalendarRouteName]: { screen: Calendar },
    [ChatRouteName]: { screen: Chat },
    [MoreRouteName]: { screen: More },
  },
  {
    initialRouteName: CalendarRouteName,
    lazy: false,
    tabBarComponent: TabBar,
    tabBarOptions: {
      keyboardHidesTabBar: false,
    },
  },
);

const AppNavigator = createOverlayNavigator({
  [TabNavigatorRouteName]: TabNavigator,
  [MultimediaModalRouteName]: MultimediaModal,
  [MultimediaTooltipModalRouteName]: MultimediaTooltipModal,
  [ActionResultModalRouteName]: ActionResultModal,
  [TextMessageTooltipModalRouteName]: TextMessageTooltipModal,
  [ThreadSettingsMemberTooltipModalRouteName]: ThreadSettingsMemberTooltipModal,
  [CameraModalRouteName]: CameraModal,
});

type WrappedAppNavigatorProps = {|
  navigation: NavigationStackProp<NavigationStateRoute>,
  isForeground: boolean,
  appCanRespondToBackButton: boolean,
|};
class WrappedAppNavigator extends React.PureComponent<WrappedAppNavigatorProps> {
  static propTypes = {
    navigation: PropTypes.shape({
      goBack: PropTypes.func.isRequired,
    }).isRequired,
    isForeground: PropTypes.bool.isRequired,
    appCanRespondToBackButton: PropTypes.bool.isRequired,
  };

  componentDidMount() {
    if (this.props.isForeground) {
      this.onForeground();
    }
  }

  componentWillUnmount() {
    if (this.props.isForeground) {
      this.onBackground();
    }
  }

  componentDidUpdate(prevProps: WrappedAppNavigatorProps) {
    if (this.props.isForeground && !prevProps.isForeground) {
      this.onForeground();
    } else if (!this.props.isForeground && prevProps.isForeground) {
      this.onBackground();
    }
  }

  onForeground() {
    BackHandler.addEventListener('hardwareBackPress', this.hardwareBack);
  }

  onBackground() {
    BackHandler.removeEventListener('hardwareBackPress', this.hardwareBack);
  }

  hardwareBack = () => {
    if (!this.props.appCanRespondToBackButton) {
      return false;
    }
    this.props.navigation.goBack(null);
    return true;
  };

  render() {
    return (
      <ChatInputStateContainer>
        <OverlayableScrollViewStateContainer>
          <KeyboardStateContainer>
            <AppNavigator navigation={this.props.navigation} />
          </KeyboardStateContainer>
        </OverlayableScrollViewStateContainer>
      </ChatInputStateContainer>
    );
  }
}

const ReduxWrappedAppNavigator = connectNav((context: ?NavContextType) => ({
  appCanRespondToBackButton: appCanRespondToBackButtonSelector(context),
  isForeground: appLoggedInSelector(context),
}))(WrappedAppNavigator);
hoistNonReactStatics(ReduxWrappedAppNavigator, AppNavigator);

const RootNavigator = createStackNavigator(
  {
    [LoggedOutModalRouteName]: LoggedOutModal,
    [VerificationModalRouteName]: VerificationModal,
    [AppRouteName]: ReduxWrappedAppNavigator,
    [ThreadPickerModalRouteName]: ThreadPickerModal,
    [AddUsersModalRouteName]: AddUsersModal,
    [CustomServerModalRouteName]: CustomServerModal,
    [ColorPickerModalRouteName]: ColorPickerModal,
    [ComposeSubthreadModalRouteName]: ComposeSubthreadModal,
  },
  {
    headerMode: 'none',
    mode: 'modal',
    transparentCard: true,
    disableKeyboardHandling: true,
    onTransitionStart: (
      transitionProps: NavigationStackTransitionProps,
      prevTransitionProps: ?NavigationStackTransitionProps,
    ) => {
      if (!prevTransitionProps) {
        return;
      }
      const { scene } = transitionProps;
      const { route } = scene;
      const { scene: prevScene } = prevTransitionProps;
      const { route: prevRoute } = prevScene;
      if (route.key === prevRoute.key) {
        return;
      }
      if (
        route.routeName !== AppRouteName ||
        prevRoute.routeName !== ThreadPickerModalRouteName
      ) {
        Keyboard.dismiss();
      }
    },
    transitionConfig: (
      transitionProps: NavigationStackTransitionProps,
      prevTransitionProps: ?NavigationStackTransitionProps,
      isModal: boolean,
    ) => {
      const defaultConfig = StackViewTransitionConfigs.defaultTransitionConfig(
        transitionProps,
        prevTransitionProps,
        isModal,
      );
      return {
        ...defaultConfig,
        screenInterpolator: sceneProps => {
          const {
            opacity: defaultOpacity,
            ...defaultInterpolation
          } = defaultConfig.screenInterpolator(sceneProps);
          const { position, scene } = sceneProps;
          const { index, route } = scene;
          if (
            accountModals.includes(route.routeName) ||
            route.routeName === AppRouteName
          ) {
            return defaultInterpolation;
          }
          const opacity = position.interpolate({
            inputRange: [index - 1, index],
            outputRange: ([0, 1]: number[]),
          });
          return { ...defaultInterpolation, opacity };
        },
      };
    },
  },
);

const defaultNavigationState = {
  index: 1,
  routes: [
    {
      key: 'App',
      routeName: AppRouteName,
      index: 0,
      routes: [
        {
          key: 'TabNavigator',
          routeName: TabNavigatorRouteName,
          index: 1,
          routes: [
            { key: 'Calendar', routeName: CalendarRouteName },
            {
              key: 'Chat',
              routeName: ChatRouteName,
              index: 0,
              routes: [
                { key: 'ChatThreadList', routeName: ChatThreadListRouteName },
              ],
            },
            {
              key: 'More',
              routeName: MoreRouteName,
              index: 0,
              routes: [{ key: 'MoreScreen', routeName: MoreScreenRouteName }],
            },
          ],
        },
      ],
    },
    { key: 'LoggedOutModal', routeName: LoggedOutModalRouteName },
  ],
};

const defaultNavInfo: NavInfo = {
  startDate: fifteenDaysEarlier().valueOf(),
  endDate: fifteenDaysLater().valueOf(),
  navigationState: defaultNavigationState,
};

function reduceNavInfo(
  state: AppState,
  action: *,
  newThreadInfos: { [id: string]: RawThreadInfo },
): NavInfo {
  let navInfoState = state.navInfo;
  // React Navigation actions
  const navigationState = RootNavigator.router.getStateForAction(
    action,
    navInfoState.navigationState,
  );
  if (navigationState && navigationState !== navInfoState.navigationState) {
    return {
      startDate: navInfoState.startDate,
      endDate: navInfoState.endDate,
      navigationState,
    };
  }

  // Filtering out screens corresponding to deauthorized threads
  const filteredNavigationState = filterChatScreensForThreadInfos(
    navInfoState.navigationState,
    newThreadInfos,
  );
  if (navInfoState.navigationState !== filteredNavigationState) {
    navInfoState = {
      startDate: navInfoState.startDate,
      endDate: navInfoState.endDate,
      navigationState: filteredNavigationState,
    };
  }

  // Deep linking
  if (action.type === handleURLActionType) {
    return {
      startDate: navInfoState.startDate,
      endDate: navInfoState.endDate,
      navigationState: handleURL(navInfoState.navigationState, action.payload),
    };
  } else if (
    action.type === logInActionTypes.success ||
    action.type === registerActionTypes.success ||
    action.type === navigateToAppActionType
  ) {
    return {
      startDate: navInfoState.startDate,
      endDate: navInfoState.endDate,
      navigationState: removeRootModals(
        navInfoState.navigationState,
        accountModals,
      ),
    };
  } else if (
    action.type === logOutActionTypes.started ||
    action.type === deleteAccountActionTypes.success
  ) {
    return resetNavInfoAndEnsureLoggedOutModalPresence(navInfoState);
  } else if (action.type === setNewSessionActionType) {
    return logOutIfCookieInvalidated(navInfoState, action.payload);
  } else if (
    action.type === leaveThreadActionTypes.success ||
    action.type === deleteThreadActionTypes.success
  ) {
    return {
      startDate: navInfoState.startDate,
      endDate: navInfoState.endDate,
      navigationState: popChatScreensForThreadID(
        navInfoState.navigationState,
        action.payload,
      ),
    };
  } else if (action.type === newThreadActionTypes.success) {
    return {
      startDate: navInfoState.startDate,
      endDate: navInfoState.endDate,
      navigationState: handleNewThread(
        navInfoState.navigationState,
        action.payload.newThreadInfo,
        state.currentUserInfo && state.currentUserInfo.id,
        state.userInfos,
      ),
    };
  } else if (action.type === notificationPressActionType) {
    return {
      startDate: navInfoState.startDate,
      endDate: navInfoState.endDate,
      navigationState: handleNotificationPress(
        navInfoState.navigationState,
        action.payload,
        state.currentUserInfo && state.currentUserInfo.id,
        state.userInfos,
      ),
    };
  }
  return navInfoState;
}

function handleURL(state: NavigationState, url: string): NavigationState {
  const urlInfo = infoFromURL(url);
  if (!urlInfo.verify) {
    // TODO correctly handle non-verify URLs
    return state;
  }

  // Special-case behavior if there's already a VerificationModal
  const currentRoute = state.routes[state.index];
  if (currentRoute.key === 'VerificationModal') {
    const newRoute = {
      ...currentRoute,
      params: {
        verifyCode: urlInfo.verify,
      },
    };
    const newRoutes = [...state.routes];
    newRoutes[state.index] = newRoute;
    return {
      index: state.index,
      routes: newRoutes,
    };
  }

  return {
    index: state.index + 1,
    routes: [
      ...state.routes,
      {
        key: 'VerificationModal',
        routeName: VerificationModalRouteName,
        params: {
          verifyCode: urlInfo.verify,
        },
      },
    ],
    isTransitioning: true,
  };
}

// This function walks from the back of the stack and calls filterFunc on each
// screen until the stack is exhausted or filterFunc returns "break". A screen
// will be removed if and only if filterFunc returns "remove" (not "break").
function removeScreensFromStack<S: NavigationState>(
  state: S,
  filterFunc: (route: NavigationRoute) => 'keep' | 'remove' | 'break',
): S {
  const newRoutes = [];
  let newIndex = state.index;
  let screenRemoved = false;
  let breakActivated = false;
  for (let i = state.routes.length - 1; i >= 0; i--) {
    const route = state.routes[i];
    if (breakActivated) {
      newRoutes.unshift(route);
      continue;
    }
    const result = filterFunc(route);
    if (result === 'break') {
      breakActivated = true;
    }
    if (breakActivated || result === 'keep') {
      newRoutes.unshift(route);
      continue;
    }
    screenRemoved = true;
    if (newIndex >= i) {
      invariant(
        newIndex !== 0,
        'Attempting to remove current route and all before it',
      );
      newIndex--;
    }
  }
  if (!screenRemoved) {
    return state;
  }
  return {
    ...state,
    index: newIndex,
    routes: newRoutes,
  };
}

function removeRootModals(
  state: NavigationState,
  modalRouteNames: string[],
): NavigationState {
  const newState = removeScreensFromStack(state, (route: NavigationRoute) =>
    modalRouteNames.includes(route.routeName) ? 'remove' : 'keep',
  );
  if (newState === state) {
    return state;
  }
  return {
    ...newState,
    isTransitioning: true,
  };
}

function resetNavInfoAndEnsureLoggedOutModalPresence(state: NavInfo): NavInfo {
  let navigationState = { ...state.navigationState };
  navigationState.routes[0] = defaultNavInfo.navigationState.routes[0];

  let loggedOutModalFound = false;
  navigationState = removeScreensFromStack(
    navigationState,
    (route: NavigationRoute) => {
      const { routeName } = route;
      if (routeName === LoggedOutModalRouteName) {
        loggedOutModalFound = true;
      }
      return routeName === AppRouteName || accountModals.includes(routeName)
        ? 'keep'
        : 'remove';
    },
  );

  if (!loggedOutModalFound) {
    const [appRoute, ...restRoutes] = navigationState.routes;
    navigationState = {
      ...navigationState,
      index: navigationState.index + 1,
      routes: [
        appRoute,
        { key: 'LoggedOutModal', routeName: LoggedOutModalRouteName },
        ...restRoutes,
      ],
    };
    if (navigationState.index === 1) {
      navigationState = {
        ...navigationState,
        isTransitioning: true,
      };
    }
  }

  return {
    startDate: defaultNavInfo.startDate,
    endDate: defaultNavInfo.endDate,
    navigationState,
  };
}

function logOutIfCookieInvalidated(
  state: NavInfo,
  payload: SetSessionPayload,
): NavInfo {
  if (!payload.sessionChange.cookieInvalidated) {
    return state;
  }
  const newState = resetNavInfoAndEnsureLoggedOutModalPresence(state);
  if (state.navigationState === newState.navigationState) {
    return newState;
  }
  if (payload.error === 'client_version_unsupported') {
    const app = Platform.select({
      ios: 'Testflight',
      android: 'Play Store',
    });
    Alert.alert(
      'App out of date',
      "Your app version is pretty old, and the server doesn't know how to " +
        `speak to it anymore. Please use the ${app} app to update!`,
      [{ text: 'OK' }],
    );
  } else {
    Alert.alert(
      'Session invalidated',
      "We're sorry, but your session was invalidated by the server. " +
        'Please log in again.',
      [{ text: 'OK' }],
    );
  }
  return newState;
}

function replaceChatRoute(
  state: NavigationState,
  replaceFunc: (chatRoute: NavigationStateRoute) => NavigationStateRoute,
): NavigationState {
  const appRoute = assertNavigationRouteNotLeafNode(state.routes[0]);
  const tabRoute = assertNavigationRouteNotLeafNode(appRoute.routes[0]);
  const chatRoute = assertNavigationRouteNotLeafNode(tabRoute.routes[1]);

  const newChatRoute = replaceFunc(chatRoute);
  if (newChatRoute === chatRoute) {
    return state;
  }

  const newTabRoutes = [...tabRoute.routes];
  newTabRoutes[1] = newChatRoute;
  const newTabRoute = { ...tabRoute, routes: newTabRoutes };

  const newAppRoutes = [...appRoute.routes];
  newAppRoutes[0] = newTabRoute;
  const newAppRoute = { ...appRoute, routes: newAppRoutes };

  const newRootRoutes = [...state.routes];
  newRootRoutes[0] = newAppRoute;
  return {
    ...state,
    routes: newRootRoutes,
    isTransitioning: true,
  };
}

function popChatScreensForThreadID(
  state: NavigationState,
  actionPayload: LeaveThreadPayload,
): NavigationState {
  const replaceFunc = (chatRoute: NavigationStateRoute) =>
    removeScreensFromStack(chatRoute, (route: NavigationRoute) => {
      if (
        (route.routeName !== MessageListRouteName &&
          route.routeName !== ThreadSettingsRouteName) ||
        (route.routeName === MessageListRouteName &&
          !!actionPayload.threadInfos[actionPayload.threadID])
      ) {
        return 'break';
      }
      const threadID = getThreadIDFromParams(route);
      if (threadID !== actionPayload.threadID) {
        return 'break';
      }
      return 'remove';
    });
  return replaceChatRoute(state, replaceFunc);
}

function filterChatScreensForThreadInfos(
  state: NavigationState,
  threadInfos: { [id: string]: RawThreadInfo },
): NavigationState {
  const replaceFunc = (chatRoute: NavigationStateRoute) =>
    removeScreensFromStack(chatRoute, (route: NavigationRoute) => {
      if (
        route.routeName !== MessageListRouteName &&
        route.routeName !== ThreadSettingsRouteName &&
        route.routeName !== DeleteThreadRouteName
      ) {
        return 'keep';
      }
      const threadID = getThreadIDFromParams(route);
      if (threadID in threadInfos) {
        return 'keep';
      }
      return 'remove';
    });
  return replaceChatRoute(state, replaceFunc);
}

function handleNewThread(
  state: NavigationState,
  rawThreadInfo: RawThreadInfo,
  viewerID: ?string,
  userInfos: { [id: string]: UserInfo },
): NavigationState {
  const threadInfo = threadInfoFromRawThreadInfo(
    rawThreadInfo,
    viewerID,
    userInfos,
  );
  const replaceFunc = (chatRoute: NavigationStateRoute) => {
    const newChatRoute = removeScreensFromStack(
      chatRoute,
      (route: NavigationRoute) =>
        route.routeName === ComposeThreadRouteName ? 'remove' : 'break',
    );
    const key =
      `${MessageListRouteName}${threadInfo.id}:` +
      getUniqueMessageListRouteKey();
    return {
      ...newChatRoute,
      routes: [
        ...newChatRoute.routes,
        {
          key,
          routeName: MessageListRouteName,
          params: { threadInfo },
        },
      ],
      index: newChatRoute.routes.length,
    };
  };
  return replaceChatRoute(state, replaceFunc);
}

function replaceChatStackWithThread(
  state: NavigationState,
  rawThreadInfo: RawThreadInfo,
  viewerID: ?string,
  userInfos: { [id: string]: UserInfo },
): NavigationState {
  const threadInfo = threadInfoFromRawThreadInfo(
    rawThreadInfo,
    viewerID,
    userInfos,
  );
  const replaceFunc = (chatRoute: NavigationStateRoute) => {
    const newChatRoute = removeScreensFromStack(
      chatRoute,
      (route: NavigationRoute) =>
        route.routeName === ChatThreadListRouteName ? 'break' : 'remove',
    );
    const key =
      `${MessageListRouteName}${threadInfo.id}:` +
      getUniqueMessageListRouteKey();
    return {
      ...newChatRoute,
      routes: [
        ...newChatRoute.routes,
        {
          key,
          routeName: MessageListRouteName,
          params: { threadInfo },
        },
      ],
      index: newChatRoute.routes.length,
    };
  };
  return replaceChatRoute(state, replaceFunc);
}

function handleNotificationPress(
  state: NavigationState,
  payload: NotificationPressPayload,
  viewerID: ?string,
  userInfos: { [id: string]: UserInfo },
): NavigationState {
  const appRoute = assertNavigationRouteNotLeafNode(state.routes[0]);
  const tabRoute = assertNavigationRouteNotLeafNode(appRoute.routes[0]);
  const chatRoute = assertNavigationRouteNotLeafNode(tabRoute.routes[1]);

  const currentChatRoute = chatRoute.routes[chatRoute.index];
  if (
    state.index === 0 &&
    appRoute.index === 0 &&
    tabRoute.index === 1 &&
    currentChatRoute.routeName === MessageListRouteName &&
    getThreadIDFromParams(currentChatRoute) === payload.rawThreadInfo.id
  ) {
    return state;
  }

  if (payload.clearChatRoutes) {
    const replacedState = replaceChatStackWithThread(
      state,
      payload.rawThreadInfo,
      viewerID,
      userInfos,
    );
    const replacedAppRoute = assertNavigationRouteNotLeafNode(
      replacedState.routes[0],
    );
    return {
      ...replacedState,
      index: 0,
      routes: [
        {
          ...replacedState.routes[0],
          index: 0,
          routes: [
            {
              ...replacedAppRoute.routes[0],
              index: 1,
            },
          ],
        },
      ],
      isTransitioning: true,
    };
  }

  const threadInfo = threadInfoFromRawThreadInfo(
    payload.rawThreadInfo,
    viewerID,
    userInfos,
  );
  const key =
    `${MessageListRouteName}${threadInfo.id}:` + getUniqueMessageListRouteKey();
  const newChatRoute = {
    ...chatRoute,
    routes: [
      ...chatRoute.routes,
      {
        key,
        routeName: MessageListRouteName,
        params: { threadInfo },
      },
    ],
    index: chatRoute.routes.length,
  };

  const newTabRoutes = [...tabRoute.routes];
  newTabRoutes[1] = newChatRoute;
  return {
    ...state,
    index: 0,
    routes: [
      {
        ...appRoute,
        index: 0,
        routes: [
          {
            ...tabRoute,
            index: 1,
            routes: newTabRoutes,
          },
        ],
      },
    ],
    isTransitioning: true,
  };
}

export {
  RootNavigator,
  defaultNavInfo,
  reduceNavInfo,
  removeScreensFromStack,
  replaceChatRoute,
  resetNavInfoAndEnsureLoggedOutModalPresence,
};
