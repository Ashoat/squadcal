// @flow

import type { AppState } from '../redux-setup';
import type { UploadMultimediaResult } from 'lib/types/media-types';
import type {
  DispatchActionPayload,
  DispatchActionPromise,
} from 'lib/utils/action-utils';
import type { PendingMultimediaUpload } from './chat-input-state';
import {
  messageTypes,
  type RawMessageInfo,
  type RawImagesMessageInfo,
  type RawMediaMessageInfo,
  type RawMultimediaMessageInfo,
  type SendMessageResult,
  type SendMessagePayload,
  type RawTextMessageInfo,
} from 'lib/types/message-types';

import * as React from 'react';
import PropTypes from 'prop-types';
import { createSelector } from 'reselect';
import _memoize from 'lodash/memoize';
import _keyBy from 'lodash/fp/keyBy';
import _omit from 'lodash/fp/omit';
import _groupBy from 'lodash/fp/groupBy';
import _partition from 'lodash/fp/partition';
import invariant from 'invariant';

import { connect } from 'lib/utils/redux-utils';
import {
  uploadMultimedia,
  updateMultimediaMessageMediaActionType,
  deleteUpload,
} from 'lib/actions/upload-actions';
import {
  createLocalMessageActionType,
  sendMultimediaMessageActionTypes,
  sendMultimediaMessage,
  sendTextMessageActionTypes,
  sendTextMessage,
} from 'lib/actions/message-actions';
import { createMediaMessageInfo } from 'lib/shared/message-utils';

import ChatMessageList from './chat-message-list.react';
import { validateFile, preloadImage } from '../utils/media-utils';
import InvalidUploadModal from '../modals/chat/invalid-upload.react';

let nextLocalUploadID = 0;

type Props = {|
  setModal: (modal: ?React.Node) => void,
  // Redux state
  activeChatThreadID: ?string,
  viewerID: ?string,
  nextLocalID: number,
  messageStoreMessages: { [id: string]: RawMessageInfo },
  // Redux dispatch functions
  dispatchActionPayload: DispatchActionPayload,
  dispatchActionPromise: DispatchActionPromise,
  // async functions that hit server APIs
  uploadMultimedia: (
    multimedia: Object,
    onProgress: (percent: number) => void,
    abortHandler?: (abort: () => void) => void,
  ) => Promise<UploadMultimediaResult>,
  deleteUpload: (id: string) => Promise<void>,
  sendMultimediaMessage: (
    threadID: string,
    localID: string,
    mediaIDs: $ReadOnlyArray<string>,
  ) => Promise<SendMessageResult>,
  sendTextMessage: (
    threadID: string,
    localID: string,
    text: string,
  ) => Promise<SendMessageResult>,
|};
type State = {|
  pendingUploads: {
    [threadID: string]: { [localUploadID: string]: PendingMultimediaUpload },
  },
  drafts: { [threadID: string]: string },
|};
class ChatInputStateContainer extends React.PureComponent<Props, State> {
  static propTypes = {
    setModal: PropTypes.func.isRequired,
    activeChatThreadID: PropTypes.string,
    viewerID: PropTypes.string,
    nextLocalID: PropTypes.number.isRequired,
    messageStoreMessages: PropTypes.object.isRequired,
    dispatchActionPayload: PropTypes.func.isRequired,
    dispatchActionPromise: PropTypes.func.isRequired,
    uploadMultimedia: PropTypes.func.isRequired,
    deleteUpload: PropTypes.func.isRequired,
    sendMultimediaMessage: PropTypes.func.isRequired,
    sendTextMessage: PropTypes.func.isRequired,
  };
  state = {
    pendingUploads: {},
    drafts: {},
  };

  static completedMessageIDs(state: State) {
    const completed = new Map();
    for (let threadID in state.pendingUploads) {
      const pendingUploads = state.pendingUploads[threadID];
      for (let localUploadID in pendingUploads) {
        const upload = pendingUploads[localUploadID];
        const { messageID, serverID, failed } = upload;
        if (!messageID || !messageID.startsWith('local')) {
          continue;
        }
        if (!serverID || failed) {
          completed.set(messageID, false);
          continue;
        }
        if (completed.get(messageID) === undefined) {
          completed.set(messageID, true);
        }
      }
    }
    const messageIDs = new Set();
    for (let [messageID, isCompleted] of completed) {
      if (isCompleted) {
        messageIDs.add(messageID);
      }
    }
    return messageIDs;
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (this.props.viewerID !== prevProps.viewerID) {
      this.setState({ pendingUploads: {} });
      return;
    }

    const previouslyAssignedMessageIDs = new Set();
    for (let threadID in prevState.pendingUploads) {
      const pendingUploads = prevState.pendingUploads[threadID];
      for (let localUploadID in pendingUploads) {
        const { messageID } = pendingUploads[localUploadID];
        if (messageID) {
          previouslyAssignedMessageIDs.add(messageID);
        }
      }
    }

    const newlyAssignedUploads = new Map();
    for (let threadID in this.state.pendingUploads) {
      const pendingUploads = this.state.pendingUploads[threadID];
      for (let localUploadID in pendingUploads) {
        const upload = pendingUploads[localUploadID];
        const { messageID } = upload;
        if (
          !messageID ||
          !messageID.startsWith('local') ||
          previouslyAssignedMessageIDs.has(messageID)
        ) {
          continue;
        }
        let assignedUploads = newlyAssignedUploads.get(messageID);
        if (!assignedUploads) {
          assignedUploads = { threadID, uploads: [] };
          newlyAssignedUploads.set(messageID, assignedUploads);
        }
        assignedUploads.uploads.push(upload);
      }
    }

    const newMessageInfos = new Map();
    for (let [messageID, assignedUploads] of newlyAssignedUploads) {
      const { uploads, threadID } = assignedUploads;
      const creatorID = this.props.viewerID;
      invariant(creatorID, 'need viewer ID in order to send a message');
      const media = uploads.map(
        ({ localID, serverID, uri, mediaType, dimensions }) => {
          // This conditional is for Flow
          if (mediaType === 'photo') {
            return {
              id: serverID ? serverID : localID,
              uri,
              type: 'photo',
              dimensions,
            };
          } else {
            return {
              id: serverID ? serverID : localID,
              uri,
              type: 'video',
              dimensions,
            };
          }
        },
      );
      const messageInfo = createMediaMessageInfo({
        localID: messageID,
        threadID,
        creatorID,
        media,
      });
      newMessageInfos.set(messageID, messageInfo);
    }

    const currentlyCompleted = ChatInputStateContainer.completedMessageIDs(
      this.state,
    );
    const previouslyCompleted = ChatInputStateContainer.completedMessageIDs(
      prevState,
    );
    for (let messageID of currentlyCompleted) {
      if (previouslyCompleted.has(messageID)) {
        continue;
      }
      let rawMessageInfo = newMessageInfos.get(messageID);
      if (rawMessageInfo) {
        newMessageInfos.delete(messageID);
      } else {
        rawMessageInfo = this.getRawMultimediaMessageInfo(messageID);
      }
      this.sendMultimediaMessage(rawMessageInfo);
    }

    for (let [, messageInfo] of newMessageInfos) {
      this.props.dispatchActionPayload(
        createLocalMessageActionType,
        messageInfo,
      );
    }
  }

  getRawMultimediaMessageInfo(
    localMessageID: string,
  ): RawMultimediaMessageInfo {
    const rawMessageInfo = this.props.messageStoreMessages[localMessageID];
    invariant(rawMessageInfo, `rawMessageInfo ${localMessageID} should exist`);
    invariant(
      rawMessageInfo.type === messageTypes.IMAGES ||
        rawMessageInfo.type === messageTypes.MULTIMEDIA,
      `rawMessageInfo ${localMessageID} should be multimedia`,
    );
    return rawMessageInfo;
  }

  sendMultimediaMessage(messageInfo: RawMultimediaMessageInfo) {
    this.props.dispatchActionPromise(
      sendMultimediaMessageActionTypes,
      this.sendMultimediaMessageAction(messageInfo),
      undefined,
      messageInfo,
    );
  }

  async sendMultimediaMessageAction(
    messageInfo: RawMultimediaMessageInfo,
  ): Promise<SendMessagePayload> {
    const { localID, threadID } = messageInfo;
    invariant(
      localID !== null && localID !== undefined,
      'localID should be set',
    );
    const mediaIDs = [];
    for (let { id } of messageInfo.media) {
      mediaIDs.push(id);
    }
    try {
      const result = await this.props.sendMultimediaMessage(
        threadID,
        localID,
        mediaIDs,
      );
      this.setState(prevState => {
        const prevUploads = prevState.pendingUploads[threadID];
        const newUploads = {};
        for (let localUploadID in prevUploads) {
          const upload = prevUploads[localUploadID];
          if (upload.messageID !== localID) {
            newUploads[localUploadID] = upload;
          } else if (!upload.uriIsReal) {
            newUploads[localUploadID] = {
              ...upload,
              messageID: result.id,
            };
          }
        }
        return {
          pendingUploads: {
            ...prevState.pendingUploads,
            [threadID]: newUploads,
          },
        };
      });
      return {
        localID,
        serverID: result.id,
        threadID,
        time: result.time,
      };
    } catch (e) {
      e.localID = localID;
      e.threadID = threadID;
      throw e;
    }
  }

  chatInputStateSelector = _memoize((threadID: string) =>
    createSelector(
      (state: State) => state.pendingUploads[threadID],
      (state: State) => state.drafts[threadID],
      (
        pendingUploads: ?{ [localUploadID: string]: PendingMultimediaUpload },
        draft: ?string,
      ) => {
        let threadPendingUploads, threadAssignedUploads;
        if (!pendingUploads) {
          threadPendingUploads = [];
          threadAssignedUploads = {};
        } else {
          const [uploadsWithMessageIDs, uploadsWithoutMessageIDs] = _partition(
            'messageID',
          )(pendingUploads);
          threadPendingUploads = uploadsWithoutMessageIDs;
          threadAssignedUploads = _groupBy('messageID')(uploadsWithMessageIDs);
        }
        return {
          pendingUploads: threadPendingUploads,
          assignedUploads: threadAssignedUploads,
          draft: draft ? draft : '',
          appendFiles: (files: $ReadOnlyArray<File>) =>
            this.appendFiles(threadID, files),
          cancelPendingUpload: (localUploadID: string) =>
            this.cancelPendingUpload(threadID, localUploadID),
          sendTextMessage: (messageInfo: RawTextMessageInfo) =>
            this.sendTextMessage(messageInfo),
          createMultimediaMessage: (localID?: number) =>
            this.createMultimediaMessage(threadID, localID),
          setDraft: (newDraft: string) => this.setDraft(threadID, newDraft),
          messageHasUploadFailure: (localMessageID: string) =>
            this.messageHasUploadFailure(threadAssignedUploads[localMessageID]),
          retryMultimediaMessage: (localMessageID: string) =>
            this.retryMultimediaMessage(
              threadID,
              localMessageID,
              threadAssignedUploads[localMessageID],
            ),
        };
      },
    ),
  );

  async appendFiles(threadID: string, files: $ReadOnlyArray<File>) {
    const validationResults = await Promise.all(files.map(validateFile));
    const newUploads = [];
    const { setModal } = this.props;
    for (let result of validationResults) {
      if (!result) {
        setModal(<InvalidUploadModal setModal={setModal} />);
        return;
      }
      const { file, mediaType, dimensions } = result;
      if (!dimensions) {
        setModal(<InvalidUploadModal setModal={setModal} />);
        return;
      }
      newUploads.push({
        localID: `localUpload${nextLocalUploadID++}`,
        serverID: null,
        messageID: null,
        failed: null,
        file,
        mediaType,
        dimensions,
        uri: URL.createObjectURL(file),
        uriIsReal: false,
        progressPercent: 0,
        abort: null,
      });
    }
    if (newUploads.length === 0) {
      setModal(<InvalidUploadModal setModal={setModal} />);
      return;
    }
    const newUploadsObject = _keyBy('localID')(newUploads);
    this.setState(
      prevState => {
        const prevUploads = prevState.pendingUploads[threadID];
        const mergedUploads = prevUploads
          ? { ...prevUploads, ...newUploadsObject }
          : newUploadsObject;
        return {
          pendingUploads: {
            ...prevState.pendingUploads,
            [threadID]: mergedUploads,
          },
        };
      },
      () => this.uploadFiles(threadID, newUploads),
    );
  }

  uploadFiles(
    threadID: string,
    uploads: $ReadOnlyArray<PendingMultimediaUpload>,
  ) {
    return Promise.all(
      uploads.map(upload => this.uploadFile(threadID, upload)),
    );
  }

  async uploadFile(threadID: string, upload: PendingMultimediaUpload) {
    let result;
    try {
      result = await this.props.uploadMultimedia(
        upload.file,
        (percent: number) =>
          this.setProgress(threadID, upload.localID, percent),
        (abort: () => void) =>
          this.handleAbortCallback(threadID, upload.localID, abort),
      );
    } catch (e) {
      this.handleUploadFailure(threadID, upload.localID, e);
      return;
    }

    const uploadAfterSuccess = this.state.pendingUploads[threadID][
      upload.localID
    ];
    invariant(
      uploadAfterSuccess,
      `pendingUpload ${upload.localID}/${result.id} for ${threadID} missing ` +
        `after upload`,
    );
    if (uploadAfterSuccess.messageID) {
      this.props.dispatchActionPayload(updateMultimediaMessageMediaActionType, {
        messageID: uploadAfterSuccess.messageID,
        currentMediaID: upload.localID,
        mediaUpdate: {
          id: result.id,
          filename: undefined,
        },
      });
    }

    this.setState(prevState => {
      const uploads = prevState.pendingUploads[threadID];
      const currentUpload = uploads[upload.localID];
      invariant(
        currentUpload,
        `pendingUpload ${upload.localID}/${result.id} for ${threadID} ` +
          `missing while assigning serverID`,
      );
      return {
        pendingUploads: {
          ...prevState.pendingUploads,
          [threadID]: {
            ...uploads,
            [upload.localID]: {
              ...currentUpload,
              serverID: result.id,
              abort: null,
            },
          },
        },
      };
    });

    await preloadImage(result.uri);

    const uploadAfterPreload = this.state.pendingUploads[threadID][
      upload.localID
    ];
    invariant(
      uploadAfterPreload,
      `pendingUpload ${upload.localID}/${result.id} for ${threadID} missing ` +
        `after preload`,
    );
    if (uploadAfterPreload.messageID) {
      this.props.dispatchActionPayload(updateMultimediaMessageMediaActionType, {
        messageID: uploadAfterPreload.messageID,
        currentMediaID: uploadAfterPreload.serverID
          ? uploadAfterPreload.serverID
          : uploadAfterPreload.localID,
        mediaUpdate: {
          uri: result.uri,
        },
      });
    }

    this.setState(prevState => {
      const uploads = prevState.pendingUploads[threadID];
      const currentUpload = uploads[upload.localID];
      invariant(
        currentUpload,
        `pendingUpload ${upload.localID}/${result.id} for ${threadID} ` +
          `missing while assigning URI`,
      );
      const { messageID } = currentUpload;
      if (messageID && !messageID.startsWith('local')) {
        const newPendingUploads = _omit([upload.localID])(uploads);
        return {
          pendingUploads: {
            ...prevState.pendingUploads,
            [threadID]: newPendingUploads,
          },
        };
      }
      return {
        pendingUploads: {
          ...prevState.pendingUploads,
          [threadID]: {
            ...uploads,
            [upload.localID]: {
              ...currentUpload,
              uri: result.uri,
              uriIsReal: true,
            },
          },
        },
      };
    });
  }

  handleAbortCallback(
    threadID: string,
    localUploadID: string,
    abort: () => void,
  ) {
    this.setState(prevState => {
      const uploads = prevState.pendingUploads[threadID];
      const upload = uploads[localUploadID];
      if (!upload) {
        // The upload has been cancelled before we were even handed the
        // abort function. We should immediately abort.
        abort();
      }
      return {
        pendingUploads: {
          ...prevState.pendingUploads,
          [threadID]: {
            ...uploads,
            [localUploadID]: {
              ...upload,
              abort,
            },
          },
        },
      };
    });
  }

  handleUploadFailure(threadID: string, localUploadID: string, e: any) {
    this.setState(prevState => {
      const uploads = prevState.pendingUploads[threadID];
      const upload = uploads[localUploadID];
      if (!upload || !upload.abort || upload.serverID) {
        // The upload has been cancelled or completed before it failed
        return {};
      }
      const failed = e instanceof Error && e.message ? e.message : 'failed';
      return {
        pendingUploads: {
          ...prevState.pendingUploads,
          [threadID]: {
            ...uploads,
            [localUploadID]: {
              ...upload,
              failed,
              progressPercent: 0,
              abort: null,
            },
          },
        },
      };
    });
  }

  cancelPendingUpload(threadID: string, localUploadID: string) {
    let revokeURL, abortRequest;
    this.setState(
      prevState => {
        const currentPendingUploads = prevState.pendingUploads[threadID];
        if (!currentPendingUploads) {
          return {};
        }
        const pendingUpload = currentPendingUploads[localUploadID];
        if (!pendingUpload) {
          return {};
        }
        if (!pendingUpload.uriIsReal) {
          revokeURL = pendingUpload.uri;
        }
        if (pendingUpload.abort) {
          abortRequest = pendingUpload.abort;
        }
        if (pendingUpload.serverID) {
          this.props.deleteUpload(pendingUpload.serverID);
        }
        const newPendingUploads = _omit([localUploadID])(currentPendingUploads);
        return {
          pendingUploads: {
            ...prevState.pendingUploads,
            [threadID]: newPendingUploads,
          },
        };
      },
      () => {
        if (revokeURL) {
          URL.revokeObjectURL(revokeURL);
        }
        if (abortRequest) {
          abortRequest();
        }
      },
    );
  }

  sendTextMessage(messageInfo: RawTextMessageInfo) {
    this.props.dispatchActionPromise(
      sendTextMessageActionTypes,
      this.sendTextMessageAction(messageInfo),
      undefined,
      messageInfo,
    );
  }

  async sendTextMessageAction(
    messageInfo: RawTextMessageInfo,
  ): Promise<SendMessagePayload> {
    try {
      const { localID } = messageInfo;
      invariant(
        localID !== null && localID !== undefined,
        'localID should be set',
      );
      const result = await this.props.sendTextMessage(
        messageInfo.threadID,
        localID,
        messageInfo.text,
      );
      return {
        localID,
        serverID: result.id,
        threadID: messageInfo.threadID,
        time: result.time,
      };
    } catch (e) {
      e.localID = messageInfo.localID;
      e.threadID = messageInfo.threadID;
      throw e;
    }
  }

  // Creates a MultimediaMessage from the unassigned pending uploads,
  // if there are any
  createMultimediaMessage(threadID: string, localID: ?number) {
    const nextLocalID =
      localID !== null && localID !== undefined
        ? localID
        : this.props.nextLocalID;
    const localMessageID = `local${nextLocalID}`;
    this.setState(prevState => {
      const currentPendingUploads = prevState.pendingUploads[threadID];
      if (!currentPendingUploads) {
        return {};
      }
      const newPendingUploads = {};
      let uploadAssigned = false;
      for (let localUploadID in currentPendingUploads) {
        const upload = currentPendingUploads[localUploadID];
        if (upload.messageID) {
          newPendingUploads[localUploadID] = upload;
        } else {
          const newUpload = {
            ...upload,
            messageID: localMessageID,
          };
          uploadAssigned = true;
          newPendingUploads[localUploadID] = newUpload;
        }
      }
      if (!uploadAssigned) {
        return {};
      }
      return {
        pendingUploads: {
          ...prevState.pendingUploads,
          [threadID]: newPendingUploads,
        },
      };
    });
  }

  setDraft(threadID: string, draft: string) {
    this.setState(prevState => ({
      drafts: {
        ...prevState.drafts,
        [threadID]: draft,
      },
    }));
  }

  setProgress(
    threadID: string,
    localUploadID: string,
    progressPercent: number,
  ) {
    this.setState(prevState => {
      const pendingUploads = prevState.pendingUploads[threadID];
      if (!pendingUploads) {
        return {};
      }
      const pendingUpload = pendingUploads[localUploadID];
      if (!pendingUpload) {
        return {};
      }
      const newPendingUploads = {
        ...pendingUploads,
        [localUploadID]: {
          ...pendingUpload,
          progressPercent,
        },
      };
      return {
        pendingUploads: {
          ...prevState.pendingUploads,
          [threadID]: newPendingUploads,
        },
      };
    });
  }

  messageHasUploadFailure(
    pendingUploads: ?$ReadOnlyArray<PendingMultimediaUpload>,
  ) {
    if (!pendingUploads) {
      return false;
    }
    return pendingUploads.some(upload => upload.failed);
  }

  retryMultimediaMessage(
    threadID: string,
    localMessageID: string,
    pendingUploads: ?$ReadOnlyArray<PendingMultimediaUpload>,
  ) {
    const rawMessageInfo = this.getRawMultimediaMessageInfo(localMessageID);
    let newRawMessageInfo;
    // This conditional is for Flow
    if (rawMessageInfo.type === messageTypes.MULTIMEDIA) {
      newRawMessageInfo = ({
        ...rawMessageInfo,
        time: Date.now(),
      }: RawMediaMessageInfo);
    } else {
      newRawMessageInfo = ({
        ...rawMessageInfo,
        time: Date.now(),
      }: RawImagesMessageInfo);
    }

    const completed = ChatInputStateContainer.completedMessageIDs(this.state);
    if (completed.has(localMessageID)) {
      this.sendMultimediaMessage(newRawMessageInfo);
      return;
    }

    if (!pendingUploads) {
      return;
    }

    // We're not actually starting the send here,
    // we just use this action to update the message's timestamp in Redux
    this.props.dispatchActionPayload(
      sendMultimediaMessageActionTypes.started,
      newRawMessageInfo,
    );

    const uploadIDsToRetry = new Set();
    const uploadsToRetry = [];
    for (let pendingUpload of pendingUploads) {
      const { serverID, messageID, localID, abort } = pendingUpload;
      if (serverID || messageID !== localMessageID) {
        continue;
      }
      if (abort) {
        abort();
      }
      uploadIDsToRetry.add(localID);
      uploadsToRetry.push(pendingUpload);
    }

    this.setState(prevState => {
      const prevPendingUploads = prevState.pendingUploads[threadID];
      if (!prevPendingUploads) {
        return {};
      }
      const newPendingUploads = {};
      let pendingUploadChanged = false;
      for (let localID in prevPendingUploads) {
        const pendingUpload = prevPendingUploads[localID];
        if (uploadIDsToRetry.has(localID) && !pendingUpload.serverID) {
          newPendingUploads[localID] = {
            ...pendingUpload,
            failed: null,
            progressPercent: 0,
            abort: null,
          };
          pendingUploadChanged = true;
        } else {
          newPendingUploads[localID] = pendingUpload;
        }
      }
      if (!pendingUploadChanged) {
        return {};
      }
      return {
        pendingUploads: {
          ...prevState.pendingUploads,
          [threadID]: newPendingUploads,
        },
      };
    });

    this.uploadFiles(threadID, uploadsToRetry);
  }

  render() {
    const { activeChatThreadID, setModal } = this.props;
    const chatInputState = activeChatThreadID
      ? this.chatInputStateSelector(activeChatThreadID)(this.state)
      : null;
    return (
      <ChatMessageList
        activeChatThreadID={activeChatThreadID}
        chatInputState={chatInputState}
        setModal={setModal}
      />
    );
  }
}

export default connect(
  (state: AppState) => ({
    activeChatThreadID: state.navInfo.activeChatThreadID,
    viewerID: state.currentUserInfo && state.currentUserInfo.id,
    nextLocalID: state.nextLocalID,
    messageStoreMessages: state.messageStore.messages,
  }),
  { uploadMultimedia, deleteUpload, sendMultimediaMessage, sendTextMessage },
)(ChatInputStateContainer);
