// @flow

import type { AppState } from '../redux/redux-setup';
import type {
  SessionIdentification,
  SessionState,
} from 'lib/types/session-types';
import type {
  ServerRequest,
  ClientClientResponse,
} from 'lib/types/request-types';
import type { NavPlusRedux } from '../types/selector-types';

import { createSelector } from 'reselect';

import { createOpenSocketFunction } from 'lib/shared/socket-utils';
import {
  getClientResponsesSelector,
  sessionStateFuncSelector,
} from 'lib/selectors/socket-selectors';

import { calendarActiveSelector } from '../navigation/nav-selectors';

const openSocketSelector: (state: AppState) => () => WebSocket = createSelector(
  (state: AppState) => state.urlPrefix,
  // We don't actually use the cookie in the socket open function, but we do use
  // it in the initial message, and when the cookie changes the socket needs to
  // be reopened. By including the cookie here, whenever the cookie changes this
  // function will change, which tells the Socket component to restart the
  // connection.
  (state: AppState) => state.cookie,
  createOpenSocketFunction,
);

const sessionIdentificationSelector: (
  state: AppState,
) => SessionIdentification = createSelector(
  (state: AppState) => state.cookie,
  (cookie: ?string): SessionIdentification => ({ cookie }),
);

const nativeGetClientResponsesSelector: (
  input: NavPlusRedux,
) => (
  serverRequests: $ReadOnlyArray<ServerRequest>,
) => $ReadOnlyArray<ClientClientResponse> = createSelector(
  (input: NavPlusRedux) => getClientResponsesSelector(input.redux),
  (input: NavPlusRedux) => calendarActiveSelector(input.navContext),
  (
    getClientResponsesFunc: (
      calendarActive: boolean,
      serverRequests: $ReadOnlyArray<ServerRequest>,
    ) => $ReadOnlyArray<ClientClientResponse>,
    calendarActive: boolean,
  ) => (serverRequests: $ReadOnlyArray<ServerRequest>) =>
    getClientResponsesFunc(calendarActive, serverRequests),
);

const nativeSessionStateFuncSelector: (
  input: NavPlusRedux,
) => () => SessionState = createSelector(
  (input: NavPlusRedux) => sessionStateFuncSelector(input.redux),
  (input: NavPlusRedux) => calendarActiveSelector(input.navContext),
  (
    sessionStateFunc: (calendarActive: boolean) => SessionState,
    calendarActive: boolean,
  ) => () => sessionStateFunc(calendarActive),
);

export {
  openSocketSelector,
  sessionIdentificationSelector,
  nativeGetClientResponsesSelector,
  nativeSessionStateFuncSelector,
};
