// @flow

import {
  type PingRequest,
  type PingResponse,
  pingResponseTypes,
} from 'lib/types/ping-types';
import { defaultNumberPerThread } from 'lib/types/message-types';
import type { Viewer } from '../session/viewer';
import {
  serverRequestTypes,
  type ThreadInconsistencyClientResponse,
  type EntryInconsistencyClientResponse,
  type ClientResponse,
  type ServerRequest,
  type CheckStateServerRequest,
} from 'lib/types/request-types';
import { isDeviceType, assertDeviceType } from 'lib/types/device-types';
import {
  reportTypes,
  type ThreadInconsistencyReportCreationRequest,
  type EntryInconsistencyReportCreationRequest,
} from 'lib/types/report-types';
import type {
  CalendarQuery,
  DeltaEntryInfosResponse,
} from 'lib/types/entry-types';
import { sessionCheckFrequency } from 'lib/types/session-types';
import type { UpdateActivityResult } from 'lib/types/activity-types';
import type { SessionUpdate } from '../updaters/session-updaters';

import t from 'tcomb';
import invariant from 'invariant';

import { ServerError } from 'lib/utils/errors';
import { mostRecentMessageTimestamp } from 'lib/shared/message-utils';
import { mostRecentUpdateTimestamp } from 'lib/shared/update-utils';
import { promiseAll } from 'lib/utils/promises';
import { values, hash } from 'lib/utils/objects';
import {
  serverEntryInfo,
  serverEntryInfosObject,
} from 'lib/shared/entry-utils';

import {
  validateInput,
  tShape,
  tPlatform,
  tPlatformDetails,
} from '../utils/validation-utils';
import {
  entryQueryInputValidator,
  normalizeCalendarQuery,
  verifyCalendarQueryThreadIDs,
} from './entry-responders';
import { fetchMessageInfosSince } from '../fetchers/message-fetchers';
import { fetchThreadInfos } from '../fetchers/thread-fetchers';
import {
  fetchEntryInfos,
  fetchEntryInfosByID,
  fetchEntriesForSession,
} from '../fetchers/entry-fetchers';
import {
  updateActivityTime,
  activityUpdater,
} from '../updaters/activity-updaters';
import {
  fetchCurrentUserInfo,
  fetchUserInfos,
  fetchKnownUserInfos,
} from '../fetchers/user-fetchers';
import { fetchUpdateInfos } from '../fetchers/update-fetchers';
import {
  setNewSession,
  setCookiePlatform,
  setCookiePlatformDetails,
} from '../session/cookies';
import { deviceTokenUpdater } from '../updaters/device-token-updaters';
import createReport from '../creators/report-creator';
import { commitSessionUpdate } from '../updaters/session-updaters';
import { compareNewCalendarQuery } from '../updaters/entry-updaters';
import { deleteUpdatesBeforeTimeTargettingSession } from '../deleters/update-deleters';
import { activityUpdatesInputValidator } from './activity-responders';
import { SQL } from '../database';
import {
  threadInconsistencyReportValidatorShape,
  entryInconsistencyReportValidatorShape,
} from './report-responders';

const clientResponseInputValidator = t.union([
  tShape({
    type: t.irreducible(
      'serverRequestTypes.PLATFORM',
      x => x === serverRequestTypes.PLATFORM,
    ),
    platform: tPlatform,
  }),
  tShape({
    type: t.irreducible(
      'serverRequestTypes.DEVICE_TOKEN',
      x => x === serverRequestTypes.DEVICE_TOKEN,
    ),
    deviceToken: t.String,
  }),
  tShape({
    ...threadInconsistencyReportValidatorShape,
    type: t.irreducible(
      'serverRequestTypes.THREAD_INCONSISTENCY',
      x => x === serverRequestTypes.THREAD_INCONSISTENCY,
    ),
  }),
  tShape({
    ...entryInconsistencyReportValidatorShape,
    type: t.irreducible(
      'serverRequestTypes.ENTRY_INCONSISTENCY',
      x => x === serverRequestTypes.ENTRY_INCONSISTENCY,
    ),
  }),
  tShape({
    type: t.irreducible(
      'serverRequestTypes.PLATFORM_DETAILS',
      x => x === serverRequestTypes.PLATFORM_DETAILS,
    ),
    platformDetails: tPlatformDetails,
  }),
  tShape({
    type: t.irreducible(
      'serverRequestTypes.INITIAL_ACTIVITY_UPDATE',
      x => x === serverRequestTypes.INITIAL_ACTIVITY_UPDATE,
    ),
    threadID: t.String,
  }),
  tShape({
    type: t.irreducible(
      'serverRequestTypes.CHECK_STATE',
      x => x === serverRequestTypes.CHECK_STATE,
    ),
    hashResults: t.dict(t.String, t.Boolean),
  }),
  tShape({
    type: t.irreducible(
      'serverRequestTypes.INITIAL_ACTIVITY_UPDATES',
      x => x === serverRequestTypes.INITIAL_ACTIVITY_UPDATES,
    ),
    activityUpdates: activityUpdatesInputValidator,
  }),
]);

const pingRequestInputValidator = tShape({
  type: t.maybe(t.Number),
  calendarQuery: entryQueryInputValidator,
  lastPing: t.maybe(t.Number), // deprecated
  messagesCurrentAsOf: t.maybe(t.Number),
  updatesCurrentAsOf: t.maybe(t.Number),
  watchedIDs: t.list(t.String),
  clientResponses: t.maybe(t.list(clientResponseInputValidator)),
});

async function pingResponder(
  viewer: Viewer,
  input: any,
): Promise<PingResponse> {
  const request: PingRequest = input;
  request.calendarQuery = normalizeCalendarQuery(request.calendarQuery);
  await validateInput(viewer, pingRequestInputValidator, request);

  let clientMessagesCurrentAsOf;
  if (
    request.messagesCurrentAsOf !== null &&
    request.messagesCurrentAsOf !== undefined
  ) {
    clientMessagesCurrentAsOf = request.messagesCurrentAsOf;
  } else if (request.lastPing !== null && request.lastPing !== undefined) {
    clientMessagesCurrentAsOf = request.lastPing;
  }
  if (
    clientMessagesCurrentAsOf === null ||
    clientMessagesCurrentAsOf === undefined
  ) {
    throw new ServerError('invalid_parameters');
  }
  const { calendarQuery } = request;
  await verifyCalendarQueryThreadIDs(calendarQuery);

  const oldUpdatesCurrentAsOf = request.updatesCurrentAsOf;
  const sessionInitializationResult = await initializeSession(
    viewer,
    calendarQuery,
    oldUpdatesCurrentAsOf,
  );

  const threadCursors = {};
  for (let watchedThreadID of request.watchedIDs) {
    threadCursors[watchedThreadID] = null;
  }
  const threadSelectionCriteria = { threadCursors, joinedThreads: true };
  const [
    messagesResult,
    { serverRequests, stateCheckStatus },
  ] = await Promise.all([
    fetchMessageInfosSince(
      viewer,
      threadSelectionCriteria,
      clientMessagesCurrentAsOf,
      defaultNumberPerThread,
    ),
    processClientResponses(viewer, request.clientResponses),
  ]);
  const incrementalUpdate =
    request.type === pingResponseTypes.INCREMENTAL &&
    sessionInitializationResult.sessionContinued;
  const messagesCurrentAsOf = mostRecentMessageTimestamp(
    messagesResult.rawMessageInfos,
    clientMessagesCurrentAsOf,
  );

  const promises = {};
  promises.activityUpdate = updateActivityTime(viewer);
  if (
    viewer.loggedIn &&
    oldUpdatesCurrentAsOf !== null &&
    oldUpdatesCurrentAsOf !== undefined
  ) {
    promises.deleteExpiredUpdates = deleteUpdatesBeforeTimeTargettingSession(
      viewer,
      oldUpdatesCurrentAsOf,
    );
    promises.fetchUpdateResult = fetchUpdateInfos(
      viewer,
      oldUpdatesCurrentAsOf,
      calendarQuery,
    );
  }
  if (incrementalUpdate && stateCheckStatus) {
    promises.stateCheck = checkState(viewer, stateCheckStatus, calendarQuery);
  }
  const { fetchUpdateResult, stateCheck } = await promiseAll(promises);

  let updateUserInfos = {},
    updatesResult = null;
  if (fetchUpdateResult) {
    invariant(
      oldUpdatesCurrentAsOf !== null && oldUpdatesCurrentAsOf !== undefined,
      'should be set',
    );
    updateUserInfos = fetchUpdateResult.userInfos;
    const { updateInfos } = fetchUpdateResult;
    const newUpdatesCurrentAsOf = mostRecentUpdateTimestamp(
      [...updateInfos],
      oldUpdatesCurrentAsOf,
    );
    updatesResult = {
      newUpdates: updateInfos,
      currentAsOf: newUpdatesCurrentAsOf,
    };
  }

  if (incrementalUpdate) {
    invariant(sessionInitializationResult.sessionContinued, 'should be set');

    let sessionUpdate = sessionInitializationResult.sessionUpdate;
    if (stateCheck && stateCheck.sessionUpdate) {
      sessionUpdate = { ...sessionUpdate, ...stateCheck.sessionUpdate };
    }
    await commitSessionUpdate(viewer, sessionUpdate);

    if (stateCheck && stateCheck.checkStateRequest) {
      serverRequests.push(stateCheck.checkStateRequest);
    }

    // $FlowFixMe should be fixed in flow-bin@0.115 / react-native@0.63
    const incrementalUserInfos = values({
      ...messagesResult.userInfos,
      ...updateUserInfos,
      ...sessionInitializationResult.deltaEntryInfoResult.userInfos,
    });
    const response: PingResponse = {
      type: pingResponseTypes.INCREMENTAL,
      messagesResult: {
        rawMessageInfos: messagesResult.rawMessageInfos,
        truncationStatuses: messagesResult.truncationStatuses,
        currentAsOf: messagesCurrentAsOf,
      },
      deltaEntryInfos:
        sessionInitializationResult.deltaEntryInfoResult.rawEntryInfos,
      userInfos: incrementalUserInfos,
      serverRequests,
    };
    if (updatesResult) {
      response.updatesResult = updatesResult;
    }
    return response;
  }

  const [threadsResult, entriesResult, currentUserInfo] = await Promise.all([
    fetchThreadInfos(viewer),
    fetchEntryInfos(viewer, [calendarQuery]),
    fetchCurrentUserInfo(viewer),
  ]);

  const deltaEntriesUserInfos = sessionInitializationResult.sessionContinued
    ? sessionInitializationResult.deltaEntryInfoResult.userInfos
    : undefined;
  const userInfos = values({
    ...messagesResult.userInfos,
    ...entriesResult.userInfos,
    ...threadsResult.userInfos,
    ...updateUserInfos,
    ...deltaEntriesUserInfos,
  });

  const response: PingResponse = {
    type: pingResponseTypes.FULL,
    threadInfos: threadsResult.threadInfos,
    currentUserInfo,
    rawMessageInfos: messagesResult.rawMessageInfos,
    truncationStatuses: messagesResult.truncationStatuses,
    messagesCurrentAsOf,
    serverTime: messagesCurrentAsOf,
    rawEntryInfos: entriesResult.rawEntryInfos,
    userInfos,
    serverRequests,
  };
  if (updatesResult) {
    response.updatesResult = updatesResult;
  }
  if (sessionInitializationResult.sessionContinued) {
    // This will only happen when the client requests a FULL response, which
    // doesn't occur in recent client versions. The client will use the result
    // to identify entry inconsistencies.
    response.deltaEntryInfos =
      sessionInitializationResult.deltaEntryInfoResult.rawEntryInfos;
  }

  return response;
}

type StateCheckStatus =
  | {| status: 'state_validated' |}
  | {| status: 'state_invalid', invalidKeys: $ReadOnlyArray<string> |}
  | {| status: 'state_check' |};
type ProcessClientResponsesResult = {|
  serverRequests: ServerRequest[],
  stateCheckStatus: ?StateCheckStatus,
  activityUpdateResult: ?UpdateActivityResult,
|};
async function processClientResponses(
  viewer: Viewer,
  clientResponses: ?$ReadOnlyArray<ClientResponse>,
): Promise<ProcessClientResponsesResult> {
  let viewerMissingPlatform = !viewer.platform;
  const { platformDetails } = viewer;
  let viewerMissingPlatformDetails =
    !platformDetails ||
    (isDeviceType(viewer.platform) &&
      (platformDetails.codeVersion === null ||
        platformDetails.codeVersion === undefined ||
        platformDetails.stateVersion === null ||
        platformDetails.stateVersion === undefined));
  let viewerMissingDeviceToken =
    isDeviceType(viewer.platform) && viewer.loggedIn && !viewer.deviceToken;

  const promises = [];
  let activityUpdates = [];
  let stateCheckStatus = null;
  if (clientResponses) {
    const clientSentPlatformDetails = clientResponses.some(
      response => response.type === serverRequestTypes.PLATFORM_DETAILS,
    );
    for (let clientResponse of clientResponses) {
      if (
        clientResponse.type === serverRequestTypes.PLATFORM &&
        !clientSentPlatformDetails
      ) {
        promises.push(setCookiePlatform(viewer, clientResponse.platform));
        viewerMissingPlatform = false;
        if (!isDeviceType(clientResponse.platform)) {
          viewerMissingPlatformDetails = false;
        }
      } else if (clientResponse.type === serverRequestTypes.DEVICE_TOKEN) {
        promises.push(
          deviceTokenUpdater(viewer, {
            deviceToken: clientResponse.deviceToken,
            deviceType: assertDeviceType(viewer.platform),
          }),
        );
        viewerMissingDeviceToken = false;
      } else if (
        clientResponse.type === serverRequestTypes.THREAD_INCONSISTENCY
      ) {
        promises.push(recordThreadInconsistency(viewer, clientResponse));
      } else if (
        clientResponse.type === serverRequestTypes.ENTRY_INCONSISTENCY
      ) {
        promises.push(recordEntryInconsistency(viewer, clientResponse));
      } else if (clientResponse.type === serverRequestTypes.PLATFORM_DETAILS) {
        promises.push(
          setCookiePlatformDetails(viewer, clientResponse.platformDetails),
        );
        viewerMissingPlatform = false;
        viewerMissingPlatformDetails = false;
      } else if (
        clientResponse.type === serverRequestTypes.INITIAL_ACTIVITY_UPDATE
      ) {
        promises.push(
          activityUpdater(viewer, {
            updates: [{ focus: true, threadID: clientResponse.threadID }],
          }),
        );
      } else if (
        clientResponse.type === serverRequestTypes.INITIAL_ACTIVITY_UPDATES
      ) {
        activityUpdates = [
          ...activityUpdates,
          ...clientResponse.activityUpdates,
        ];
      } else if (clientResponse.type === serverRequestTypes.CHECK_STATE) {
        const invalidKeys = [];
        for (let key in clientResponse.hashResults) {
          const result = clientResponse.hashResults[key];
          if (!result) {
            invalidKeys.push(key);
          }
        }
        stateCheckStatus =
          invalidKeys.length > 0
            ? { status: 'state_invalid', invalidKeys }
            : { status: 'state_validated' };
      }
    }
  }

  let activityUpdateResult;
  if (activityUpdates.length > 0 || promises.length > 0) {
    [activityUpdateResult] = await Promise.all([
      activityUpdates.length > 0
        ? activityUpdater(viewer, { updates: activityUpdates })
        : undefined,
      promises.length > 0 ? Promise.all(promises) : undefined,
    ]);
  }

  if (
    !stateCheckStatus &&
    viewer.loggedIn &&
    viewer.sessionLastValidated + sessionCheckFrequency < Date.now()
  ) {
    stateCheckStatus = { status: 'state_check' };
  }

  const serverRequests = [];
  if (viewerMissingPlatform) {
    serverRequests.push({ type: serverRequestTypes.PLATFORM });
  }
  if (viewerMissingPlatformDetails) {
    serverRequests.push({ type: serverRequestTypes.PLATFORM_DETAILS });
  }
  if (viewerMissingDeviceToken) {
    serverRequests.push({ type: serverRequestTypes.DEVICE_TOKEN });
  }
  return { serverRequests, stateCheckStatus, activityUpdateResult };
}

async function recordThreadInconsistency(
  viewer: Viewer,
  response: ThreadInconsistencyClientResponse,
): Promise<void> {
  const { type, ...rest } = response;
  const reportCreationRequest = ({
    ...rest,
    type: reportTypes.THREAD_INCONSISTENCY,
  }: ThreadInconsistencyReportCreationRequest);
  await createReport(viewer, reportCreationRequest);
}

async function recordEntryInconsistency(
  viewer: Viewer,
  response: EntryInconsistencyClientResponse,
): Promise<void> {
  const { type, ...rest } = response;
  const reportCreationRequest = ({
    ...rest,
    type: reportTypes.ENTRY_INCONSISTENCY,
  }: EntryInconsistencyReportCreationRequest);
  await createReport(viewer, reportCreationRequest);
}

type SessionInitializationResult =
  | {| sessionContinued: false |}
  | {|
      sessionContinued: true,
      deltaEntryInfoResult: DeltaEntryInfosResponse,
      sessionUpdate: SessionUpdate,
    |};
async function initializeSession(
  viewer: Viewer,
  calendarQuery: CalendarQuery,
  oldLastUpdate: ?number,
): Promise<SessionInitializationResult> {
  if (!viewer.loggedIn) {
    return { sessionContinued: false };
  }

  let comparisonResult = null;
  try {
    comparisonResult = compareNewCalendarQuery(viewer, calendarQuery);
  } catch (e) {
    if (e.message !== 'unknown_error') {
      throw e;
    }
  }

  if (comparisonResult) {
    const { difference, sessionUpdate, oldCalendarQuery } = comparisonResult;
    if (oldLastUpdate !== null && oldLastUpdate !== undefined) {
      sessionUpdate.lastUpdate = oldLastUpdate;
    }
    const deltaEntryInfoResult = await fetchEntriesForSession(
      viewer,
      difference,
      oldCalendarQuery,
    );
    return { sessionContinued: true, deltaEntryInfoResult, sessionUpdate };
  } else if (oldLastUpdate !== null && oldLastUpdate !== undefined) {
    await setNewSession(viewer, calendarQuery, oldLastUpdate);
    return { sessionContinued: false };
  } else {
    // We're only able to create the session if we have oldLastUpdate. At this
    // time the only code in pingResponder that uses viewer.session should be
    // gated on oldLastUpdate anyways, so we should be okay just returning.
    return { sessionContinued: false };
  }
}

type StateCheckResult = {|
  sessionUpdate?: SessionUpdate,
  checkStateRequest?: CheckStateServerRequest,
|};
async function checkState(
  viewer: Viewer,
  status: StateCheckStatus,
  calendarQuery: CalendarQuery,
): Promise<StateCheckResult> {
  if (status.status === 'state_validated') {
    return { sessionUpdate: { lastValidated: Date.now() } };
  } else if (status.status === 'state_check') {
    const fetchedData = await promiseAll({
      threadsResult: fetchThreadInfos(viewer),
      entriesResult: fetchEntryInfos(viewer, [calendarQuery]),
      currentUserInfo: fetchCurrentUserInfo(viewer),
      userInfosResult: fetchKnownUserInfos(viewer),
    });
    const hashesToCheck = {
      threadInfos: hash(fetchedData.threadsResult.threadInfos),
      entryInfos: hash(
        serverEntryInfosObject(fetchedData.entriesResult.rawEntryInfos),
      ),
      currentUserInfo: hash(fetchedData.currentUserInfo),
      userInfos: hash(fetchedData.userInfosResult),
    };
    const checkStateRequest = {
      type: serverRequestTypes.CHECK_STATE,
      hashesToCheck,
    };
    return { checkStateRequest };
  }

  const { invalidKeys } = status;

  let fetchAllThreads = false,
    fetchAllEntries = false,
    fetchAllUserInfos = false,
    fetchUserInfo = false;
  const threadIDsToFetch = [],
    entryIDsToFetch = [],
    userIDsToFetch = [];
  for (let key of invalidKeys) {
    if (key === 'threadInfos') {
      fetchAllThreads = true;
    } else if (key === 'entryInfos') {
      fetchAllEntries = true;
    } else if (key === 'userInfos') {
      fetchAllUserInfos = true;
    } else if (key === 'currentUserInfo') {
      fetchUserInfo = true;
    } else if (key.startsWith('threadInfo|')) {
      const [, threadID] = key.split('|');
      threadIDsToFetch.push(threadID);
    } else if (key.startsWith('entryInfo|')) {
      const [, entryID] = key.split('|');
      entryIDsToFetch.push(entryID);
    } else if (key.startsWith('userInfo|')) {
      const [, userID] = key.split('|');
      userIDsToFetch.push(userID);
    }
  }

  const fetchPromises = {};
  if (fetchAllThreads) {
    fetchPromises.threadsResult = fetchThreadInfos(viewer);
  } else if (threadIDsToFetch.length > 0) {
    fetchPromises.threadsResult = fetchThreadInfos(
      viewer,
      SQL`t.id IN (${threadIDsToFetch})`,
    );
  }
  if (fetchAllEntries) {
    fetchPromises.entriesResult = fetchEntryInfos(viewer, [calendarQuery]);
  } else if (entryIDsToFetch.length > 0) {
    fetchPromises.entryInfos = fetchEntryInfosByID(viewer, entryIDsToFetch);
  }
  if (fetchAllUserInfos) {
    fetchPromises.userInfos = fetchKnownUserInfos(viewer);
  } else if (userIDsToFetch.length > 0) {
    fetchPromises.userInfos = fetchUserInfos(userIDsToFetch);
  }
  if (fetchUserInfo) {
    fetchPromises.currentUserInfo = fetchCurrentUserInfo(viewer);
  }
  const fetchedData = await promiseAll(fetchPromises);

  const hashesToCheck = {},
    failUnmentioned = {},
    stateChanges = {};
  for (let key of invalidKeys) {
    if (key === 'threadInfos') {
      // Instead of returning all threadInfos, we want to narrow down and figure
      // out which threadInfos don't match first
      const { threadInfos } = fetchedData.threadsResult;
      for (let threadID in threadInfos) {
        hashesToCheck[`threadInfo|${threadID}`] = hash(threadInfos[threadID]);
      }
      failUnmentioned.threadInfos = true;
    } else if (key === 'entryInfos') {
      // Instead of returning all entryInfos, we want to narrow down and figure
      // out which entryInfos don't match first
      const { rawEntryInfos } = fetchedData.entriesResult;
      for (let rawEntryInfo of rawEntryInfos) {
        const entryInfo = serverEntryInfo(rawEntryInfo);
        invariant(entryInfo, 'should be set');
        const { id: entryID } = entryInfo;
        invariant(entryID, 'should be set');
        hashesToCheck[`entryInfo|${entryID}`] = hash(entryInfo);
      }
      failUnmentioned.entryInfos = true;
    } else if (key === 'userInfos') {
      // Instead of returning all userInfos, we want to narrow down and figure
      // out which userInfos don't match first
      const { userInfos } = fetchedData;
      for (let userID in userInfos) {
        hashesToCheck[`userInfo|${userID}`] = hash(userInfos[userID]);
      }
      failUnmentioned.userInfos = true;
    } else if (key === 'currentUserInfo') {
      stateChanges.currentUserInfo = fetchedData.currentUserInfo;
    } else if (key.startsWith('threadInfo|')) {
      const [, threadID] = key.split('|');
      const { threadInfos } = fetchedData.threadsResult;
      const threadInfo = threadInfos[threadID];
      if (!threadInfo) {
        if (!stateChanges.deleteThreadIDs) {
          stateChanges.deleteThreadIDs = [];
        }
        stateChanges.deleteThreadIDs.push(threadID);
        continue;
      }
      if (!stateChanges.rawThreadInfos) {
        stateChanges.rawThreadInfos = [];
      }
      stateChanges.rawThreadInfos.push(threadInfo);
    } else if (key.startsWith('entryInfo|')) {
      const [, entryID] = key.split('|');
      const rawEntryInfos = fetchedData.entriesResult
        ? fetchedData.entriesResult.rawEntryInfos
        : fetchedData.entryInfos;
      const entryInfo = rawEntryInfos.find(
        candidate => candidate.id === entryID,
      );
      if (!entryInfo) {
        if (!stateChanges.deleteEntryIDs) {
          stateChanges.deleteEntryIDs = [];
        }
        stateChanges.deleteEntryIDs.push(entryID);
        continue;
      }
      if (!stateChanges.rawEntryInfos) {
        stateChanges.rawEntryInfos = [];
      }
      stateChanges.rawEntryInfos.push(entryInfo);
    } else if (key.startsWith('userInfo|')) {
      const userInfos = {};
      const { userInfos: fetchedUserInfos } = fetchedData;
      for (let userID in fetchedUserInfos) {
        const userInfo = fetchedUserInfos[userID];
        if (userInfo && userInfo.username) {
          userInfos[userID] = userInfo;
        }
      }

      const [, userID] = key.split('|');
      const userInfo = userInfos[userID];
      if (!userInfo) {
        if (!stateChanges.deleteUserInfoIDs) {
          stateChanges.deleteUserInfoIDs = [];
        }
        stateChanges.deleteUserInfoIDs.push(userID);
        continue;
      }
      if (!stateChanges.userInfos) {
        stateChanges.userInfos = [];
      }
      stateChanges.userInfos.push(userInfo);
    }
  }

  const checkStateRequest = {
    type: serverRequestTypes.CHECK_STATE,
    hashesToCheck,
    failUnmentioned,
    stateChanges,
  };
  if (Object.keys(hashesToCheck).length === 0) {
    return { checkStateRequest, sessionUpdate: { lastValidated: Date.now() } };
  } else {
    return { checkStateRequest };
  }
}

export {
  clientResponseInputValidator,
  pingResponder,
  processClientResponses,
  initializeSession,
  checkState,
};
