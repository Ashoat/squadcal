// @flow

import { AppState as NativeAppState, Platform, Alert } from 'react-native';
import type { Orientations } from 'react-native-orientation-locker';
import Orientation from 'react-native-orientation-locker';
import { createStore, applyMiddleware, type Store, compose } from 'redux';
import { persistStore, persistReducer } from 'redux-persist';
import type { PersistState } from 'redux-persist/src/types';
import thunk from 'redux-thunk';

import { setDeviceTokenActionTypes } from 'lib/actions/device-actions';
import {
  logOutActionTypes,
  deleteAccountActionTypes,
  logInActionTypes,
} from 'lib/actions/user-actions';
import baseReducer from 'lib/reducers/master-reducer';
import {
  invalidSessionDowngrade,
  invalidSessionRecovery,
} from 'lib/shared/account-utils';
import { type EnabledApps, defaultEnabledApps } from 'lib/types/enabled-apps';
import { type EntryStore } from 'lib/types/entry-types';
import {
  type CalendarFilter,
  defaultCalendarFilters,
} from 'lib/types/filter-types';
import type { LifecycleState } from 'lib/types/lifecycle-state-types';
import type { LoadingStatus } from 'lib/types/loading-types';
import type { MessageStore } from 'lib/types/message-types';
import type { Dispatch } from 'lib/types/redux-types';
import { type ReportStore } from 'lib/types/report-types';
import type { SetSessionPayload } from 'lib/types/session-types';
import {
  type ConnectionInfo,
  defaultConnectionInfo,
  incrementalStateSyncActionType,
} from 'lib/types/socket-types';
import type { ThreadStore } from 'lib/types/thread-types';
import { updateTypes } from 'lib/types/update-types';
import type { CurrentUserInfo, UserStore } from 'lib/types/user-types';
import { reduxLoggerMiddleware } from 'lib/utils/action-logger';
import { setNewSessionActionType } from 'lib/utils/action-utils';

import { defaultNavInfo } from '../navigation/default-state';
import { getGlobalNavContext } from '../navigation/icky-global';
import { activeMessageListSelector } from '../navigation/nav-selectors';
import {
  type NotifPermissionAlertInfo,
  defaultNotifPermissionAlertInfo,
} from '../push/alerts';
import { reduceThreadIDsToNotifIDs } from '../push/reducer';
import reactotron from '../reactotron';
import {
  type DeviceCameraInfo,
  defaultDeviceCameraInfo,
} from '../types/camera';
import {
  type ConnectivityInfo,
  defaultConnectivityInfo,
} from '../types/connectivity';
import type { NavInfo } from '../types/nav-types';
import { setCurrentTransitionSidebarSourceIDType } from '../types/nav-types';
import { type GlobalThemeInfo, defaultGlobalThemeInfo } from '../types/themes';
import {
  defaultURLPrefix,
  natNodeServer,
  setCustomServer,
  fetchDevServerHostname,
  updateURLPrefixAfterCheckingIfEmulator,
} from '../utils/url-utils';
import {
  resetUserStateActionType,
  recordNotifPermissionAlertActionType,
  recordAndroidNotificationActionType,
  clearAndroidNotificationsActionType,
  rescindAndroidNotificationActionType,
  updateDimensionsActiveType,
  updateConnectivityActiveType,
  updateThemeInfoActionType,
  updateDeviceCameraInfoActionType,
  updateDeviceOrientationActionType,
  updateThreadLastNavigatedActionType,
  backgroundActionTypes,
  setReduxStateActionType,
} from './action-types';
import { remoteReduxDevServerConfig } from './dev-tools';
import {
  defaultDimensionsInfo,
  type DimensionsInfo,
} from './dimensions-updater.react';
import { persistConfig, setPersistor } from './persist';

export type AppState = {|
  navInfo: NavInfo,
  currentUserInfo: ?CurrentUserInfo,
  entryStore: EntryStore,
  threadStore: ThreadStore,
  userStore: UserStore,
  messageStore: MessageStore,
  updatesCurrentAsOf: number,
  loadingStatuses: { [key: string]: { [idx: number]: LoadingStatus } },
  calendarFilters: $ReadOnlyArray<CalendarFilter>,
  cookie: ?string,
  deviceToken: ?string,
  dataLoaded: boolean,
  urlPrefix: string,
  customServer: ?string,
  threadIDsToNotifIDs: { [threadID: string]: string[] },
  notifPermissionAlertInfo: NotifPermissionAlertInfo,
  connection: ConnectionInfo,
  watchedThreadIDs: $ReadOnlyArray<string>,
  lifecycleState: LifecycleState,
  enabledApps: EnabledApps,
  reportStore: ReportStore,
  nextLocalID: number,
  _persist: ?PersistState,
  sessionID?: void,
  dimensions: DimensionsInfo,
  connectivity: ConnectivityInfo,
  globalThemeInfo: GlobalThemeInfo,
  deviceCameraInfo: DeviceCameraInfo,
  deviceOrientation: Orientations,
  frozen: boolean,
|};

const defaultState = ({
  navInfo: defaultNavInfo,
  currentUserInfo: null,
  entryStore: {
    entryInfos: {},
    daysToEntries: {},
    lastUserInteractionCalendar: 0,
  },
  threadStore: {
    threadInfos: {},
  },
  userStore: {
    userInfos: {},
    inconsistencyReports: [],
  },
  messageStore: {
    messages: {},
    threads: {},
    local: {},
    currentAsOf: 0,
  },
  updatesCurrentAsOf: 0,
  loadingStatuses: {},
  calendarFilters: defaultCalendarFilters,
  cookie: null,
  deviceToken: null,
  dataLoaded: false,
  urlPrefix: defaultURLPrefix,
  customServer: natNodeServer,
  threadIDsToNotifIDs: {},
  notifPermissionAlertInfo: defaultNotifPermissionAlertInfo,
  connection: defaultConnectionInfo(Platform.OS),
  watchedThreadIDs: [],
  lifecycleState: 'active',
  enabledApps: defaultEnabledApps,
  reportStore: {
    enabledReports: {
      crashReports: __DEV__,
      inconsistencyReports: __DEV__,
      mediaReports: __DEV__,
    },
    queuedReports: [],
  },
  nextLocalID: 0,
  _persist: null,
  dimensions: defaultDimensionsInfo,
  connectivity: defaultConnectivityInfo,
  globalThemeInfo: defaultGlobalThemeInfo,
  deviceCameraInfo: defaultDeviceCameraInfo,
  deviceOrientation: Orientation.getInitialOrientation(),
  frozen: false,
}: AppState);

function reducer(state: AppState = defaultState, action: *) {
  if (action.type === setReduxStateActionType) {
    return action.state;
  }
  if (
    (action.type === setNewSessionActionType &&
      invalidSessionDowngrade(
        state,
        action.payload.sessionChange.currentUserInfo,
        action.payload.preRequestUserState,
      )) ||
    (action.type === logOutActionTypes.success &&
      invalidSessionDowngrade(
        state,
        action.payload.currentUserInfo,
        action.payload.preRequestUserState,
      )) ||
    (action.type === deleteAccountActionTypes.success &&
      invalidSessionDowngrade(
        state,
        action.payload.currentUserInfo,
        action.payload.preRequestUserState,
      ))
  ) {
    return state;
  }
  if (
    (action.type === setNewSessionActionType &&
      invalidSessionRecovery(
        state,
        action.payload.sessionChange.currentUserInfo,
        action.payload.source,
      )) ||
    (action.type === logInActionTypes.success &&
      invalidSessionRecovery(
        state,
        action.payload.currentUserInfo,
        action.payload.source,
      ))
  ) {
    return state;
  }
  if (
    action.type === recordAndroidNotificationActionType ||
    action.type === clearAndroidNotificationsActionType ||
    action.type === rescindAndroidNotificationActionType
  ) {
    return {
      ...state,
      threadIDsToNotifIDs: reduceThreadIDsToNotifIDs(
        state.threadIDsToNotifIDs,
        action,
      ),
    };
  } else if (action.type === setCustomServer) {
    return {
      ...state,
      customServer: action.payload,
    };
  } else if (action.type === recordNotifPermissionAlertActionType) {
    return {
      ...state,
      notifPermissionAlertInfo: {
        totalAlerts: state.notifPermissionAlertInfo.totalAlerts + 1,
        lastAlertTime: action.payload.time,
      },
    };
  } else if (action.type === resetUserStateActionType) {
    const cookie =
      state.cookie && state.cookie.startsWith('anonymous=')
        ? state.cookie
        : null;
    const currentUserInfo =
      state.currentUserInfo && state.currentUserInfo.anonymous
        ? state.currentUserInfo
        : null;
    return {
      ...state,
      currentUserInfo,
      cookie,
    };
  } else if (action.type === updateDimensionsActiveType) {
    return {
      ...state,
      dimensions: {
        ...state.dimensions,
        ...action.payload,
      },
    };
  } else if (action.type === updateConnectivityActiveType) {
    return {
      ...state,
      connectivity: action.payload,
    };
  } else if (action.type === updateThemeInfoActionType) {
    return {
      ...state,
      globalThemeInfo: {
        ...state.globalThemeInfo,
        ...action.payload,
      },
    };
  } else if (action.type === updateDeviceCameraInfoActionType) {
    return {
      ...state,
      deviceCameraInfo: {
        ...state.deviceCameraInfo,
        ...action.payload,
      },
    };
  } else if (action.type === updateDeviceOrientationActionType) {
    return {
      ...state,
      deviceOrientation: action.payload,
    };
  } else if (action.type === setDeviceTokenActionTypes.success) {
    return {
      ...state,
      deviceToken: action.payload,
    };
  } else if (action.type === setCurrentTransitionSidebarSourceIDType) {
    return {
      ...state,
      navInfo: {
        ...state.navInfo,
        currentTransitionSidebarSourceID: action.payload,
      },
    };
  } else if (action.type === updateThreadLastNavigatedActionType) {
    const { threadID, time } = action.payload;
    if (state.messageStore.threads[threadID]) {
      state = {
        ...state,
        messageStore: {
          ...state.messageStore,
          threads: {
            ...state.messageStore.threads,
            [threadID]: {
              ...state.messageStore.threads[threadID],
              lastNavigatedTo: time,
            },
          },
        },
      };
    }
  }

  if (action.type === setNewSessionActionType) {
    sessionInvalidationAlert(action.payload);
    state = {
      ...state,
      cookie: action.payload.sessionChange.cookie,
    };
  } else if (action.type === incrementalStateSyncActionType) {
    let wipeDeviceToken = false;
    for (const update of action.payload.updatesResult.newUpdates) {
      if (
        update.type === updateTypes.BAD_DEVICE_TOKEN &&
        update.deviceToken === state.deviceToken
      ) {
        wipeDeviceToken = true;
        break;
      }
    }
    if (wipeDeviceToken) {
      state = {
        ...state,
        deviceToken: null,
      };
    }
  }

  state = baseReducer(state, action);

  return fixUnreadActiveThread(state, action);
}

function sessionInvalidationAlert(payload: SetSessionPayload) {
  if (
    !payload.sessionChange.cookieInvalidated ||
    !payload.preRequestUserState ||
    !payload.preRequestUserState.currentUserInfo ||
    payload.preRequestUserState.currentUserInfo.anonymous
  ) {
    return;
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
      { cancelable: true },
    );
  } else {
    Alert.alert(
      'Session invalidated',
      "We're sorry, but your session was invalidated by the server. " +
        'Please log in again.',
      [{ text: 'OK' }],
      { cancelable: true },
    );
  }
}

// Makes sure a currently focused thread is never unread. Note that we consider
// a backgrounded NativeAppState to actually be active if it last changed to
// inactive more than 10 seconds ago. This is because there is a delay when
// NativeAppState is updating in response to a foreground, and actions don't get
// processed more than 10 seconds after a backgrounding anyways. However we
// don't consider this for action types that can be expected to happen while the
// app is backgrounded.
function fixUnreadActiveThread(state: AppState, action: *): AppState {
  const navContext = getGlobalNavContext();
  const activeThread = activeMessageListSelector(navContext);
  if (
    activeThread &&
    (NativeAppState.currentState === 'active' ||
      (appLastBecameInactive + 10000 < Date.now() &&
        !backgroundActionTypes.has(action.type))) &&
    state.threadStore.threadInfos[activeThread] &&
    state.threadStore.threadInfos[activeThread].currentUser.unread
  ) {
    state = {
      ...state,
      threadStore: {
        ...state.threadStore,
        threadInfos: {
          ...state.threadStore.threadInfos,
          [activeThread]: {
            ...state.threadStore.threadInfos[activeThread],
            currentUser: {
              ...state.threadStore.threadInfos[activeThread].currentUser,
              unread: false,
            },
          },
        },
      },
    };
  }
  return state;
}

let appLastBecameInactive = 0;
function appBecameInactive() {
  appLastBecameInactive = Date.now();
}

const middlewares = [thunk, reduxLoggerMiddleware];
if (__DEV__) {
  const createDebugger = require('redux-flipper').default;
  middlewares.push(createDebugger());
}

const middleware = applyMiddleware(...middlewares);

let composeFunc = compose;
if (__DEV__ && global.HermesInternal) {
  const { composeWithDevTools } = require('remote-redux-devtools/src');
  composeFunc = composeWithDevTools(fetchDevServerHostname(), {
    name: 'Redux',
    ...remoteReduxDevServerConfig,
  });
} else if (global.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) {
  composeFunc = global.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({
    name: 'Redux',
  });
}

let enhancers;
if (reactotron) {
  enhancers = composeFunc(middleware, reactotron.createEnhancer());
} else {
  enhancers = composeFunc(middleware);
}

const store: Store<AppState, *> = createStore(
  persistReducer(persistConfig, reducer),
  defaultState,
  enhancers,
);
const persistor = persistStore(store);
setPersistor(persistor);

const unsafeDispatch: any = store.dispatch;
const dispatch: Dispatch = unsafeDispatch;

updateURLPrefixAfterCheckingIfEmulator(store);

export { store, dispatch, appBecameInactive };
