// @flow

import invariant from 'invariant';

import { createPendingSidebar } from 'lib/shared/thread-utils';
import type { ThreadInfo } from 'lib/types/thread-types';

import { getDefaultTextMessageRules } from '../markdown/rules.react';
import type { ChatMessageInfoItemWithHeight } from './message.react';

function getSidebarThreadInfo(
  sourceMessage: ChatMessageInfoItemWithHeight,
  viewerID?: ?string,
): ThreadInfo {
  const threadCreatedFromMessage = sourceMessage.threadCreatedFromMessage;
  if (threadCreatedFromMessage) {
    return threadCreatedFromMessage;
  }

  invariant(viewerID, 'viewerID should be set');

  const { messageInfo, threadInfo } = sourceMessage;
  return createPendingSidebar(
    messageInfo,
    threadInfo,
    viewerID,
    getDefaultTextMessageRules().simpleMarkdownRules,
  );
}

export { getSidebarThreadInfo };
