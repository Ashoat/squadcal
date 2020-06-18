// @flow

import type { LeafRoute } from '@react-navigation/native';
import type { VerificationModalParams } from '../account/verification-modal.react';
import type { ThreadPickerModalParams } from '../calendar/thread-picker-modal.react';
import type { AddUsersModalParams } from '../chat/settings/add-users-modal.react';
import type { CustomServerModalParams } from '../more/custom-server-modal.react';
import type { ColorPickerModalParams } from '../chat/settings/color-picker-modal.react';
import type { ComposeSubthreadModalParams } from '../chat/settings/compose-subthread-modal.react';
import type { MultimediaModalParams } from '../media/multimedia-modal.react';
import type { MultimediaTooltipModalParams } from '../chat/multimedia-tooltip-modal.react';
import type { ActionResultModalParams } from './action-result-modal.react';
import type { TextMessageTooltipModalParams } from '../chat/text-message-tooltip-modal.react';
import type { ThreadSettingsMemberTooltipModalParams } from '../chat/settings/thread-settings-member-tooltip-modal.react';
import type { CameraModalParams } from '../media/camera-modal.react';
import type { ComposeThreadParams } from '../chat/compose-thread.react';
import type { ThreadSettingsParams } from '../chat/settings/thread-settings.react';
import type { DeleteThreadParams } from '../chat/settings/delete-thread.react';
import type { MessageListParams } from '../chat/message-list-types';

export const AppRouteName = 'App';
export const TabNavigatorRouteName = 'TabNavigator';
export const ComposeThreadRouteName = 'ComposeThread';
export const DeleteThreadRouteName = 'DeleteThread';
export const ThreadSettingsRouteName = 'ThreadSettings';
export const MessageListRouteName = 'MessageList';
export const VerificationModalRouteName = 'VerificationModal';
export const LoggedOutModalRouteName = 'LoggedOutModal';
export const MoreRouteName = 'More';
export const MoreScreenRouteName = 'MoreScreen';
export const ChatRouteName = 'Chat';
export const ChatThreadListRouteName = 'ChatThreadList';
export const HomeChatThreadListRouteName = 'Home';
export const BackgroundChatThreadListRouteName = 'Background';
export const CalendarRouteName = 'Calendar';
export const BuildInfoRouteName = 'BuildInfo';
export const DeleteAccountRouteName = 'DeleteAccount';
export const DevToolsRouteName = 'DevTools';
export const EditEmailRouteName = 'EditEmail';
export const EditPasswordRouteName = 'EditPassword';
export const AppearancePreferencesRouteName = 'AppearancePreferences';
export const ThreadPickerModalRouteName = 'ThreadPickerModal';
export const AddUsersModalRouteName = 'AddUsersModal';
export const CustomServerModalRouteName = 'CustomServerModal';
export const ColorPickerModalRouteName = 'ColorPickerModal';
export const ComposeSubthreadModalRouteName = 'ComposeSubthreadModal';
export const MultimediaModalRouteName = 'MultimediaModal';
export const MultimediaTooltipModalRouteName = 'MultimediaTooltipModal';
export const ActionResultModalRouteName = 'ActionResultModal';
export const TextMessageTooltipModalRouteName = 'TextMessageTooltipModal';
export const ThreadSettingsMemberTooltipModalRouteName =
  'ThreadSettingsMemberTooltipModal';
export const CameraModalRouteName = 'CameraModal';
export const FriendListRouteName = 'FriendList';
export const BlockListRouteName = 'BlockList';
export const AddFriendsModalRouteName = 'AddFriendsModal';

export type RootParamList = {|
  LoggedOutModal: void,
  VerificationModal: VerificationModalParams,
  App: void,
  ThreadPickerModal: ThreadPickerModalParams,
  AddUsersModal: AddUsersModalParams,
  CustomServerModal: CustomServerModalParams,
  ColorPickerModal: ColorPickerModalParams,
  ComposeSubthreadModal: ComposeSubthreadModalParams,
  AddFriendsModal: void,
|};

export type TooltipModalParamList = {|
  MultimediaTooltipModal: MultimediaTooltipModalParams,
  TextMessageTooltipModal: TextMessageTooltipModalParams,
  ThreadSettingsMemberTooltipModal: ThreadSettingsMemberTooltipModalParams,
|};

export type OverlayParamList = {|
  TabNavigator: void,
  MultimediaModal: MultimediaModalParams,
  ActionResultModal: ActionResultModalParams,
  CameraModal: CameraModalParams,
  ...TooltipModalParamList,
|};

export type TabParamList = {|
  Calendar: void,
  Chat: void,
  More: void,
|};

export type ChatParamList = {|
  ChatThreadList: void,
  MessageList: MessageListParams,
  ComposeThread: ComposeThreadParams,
  ThreadSettings: ThreadSettingsParams,
  DeleteThread: DeleteThreadParams,
|};

export type ChatTopTabsParamList = {|
  HomeChatThreadList: void,
  BackgroundChatThreadList: void,
|};

export type MoreParamList = {|
  MoreScreen: void,
  EditEmail: void,
  EditPassword: void,
  DeleteAccount: void,
  BuildInfo: void,
  DevTools: void,
  AppearancePreferences: void,
  FriendList: void,
  BlockList: void,
|};

export type ScreenParamList = {|
  ...RootParamList,
  ...OverlayParamList,
  ...TabParamList,
  ...ChatParamList,
  ...ChatTopTabsParamList,
  ...MoreParamList,
|};

export type NavigationRoute<RouteName: string = $Keys<ScreenParamList>> = {|
  ...LeafRoute<RouteName>,
  +params: $ElementType<ScreenParamList, RouteName>,
|};

export const accountModals = [
  LoggedOutModalRouteName,
  VerificationModalRouteName,
];

export const scrollBlockingChatModals = [
  MultimediaModalRouteName,
  MultimediaTooltipModalRouteName,
  TextMessageTooltipModalRouteName,
  ThreadSettingsMemberTooltipModalRouteName,
];

export const chatRootModals = [
  AddUsersModalRouteName,
  ColorPickerModalRouteName,
  ComposeSubthreadModalRouteName,
];

export const threadRoutes = [
  MessageListRouteName,
  ThreadSettingsRouteName,
  DeleteThreadRouteName,
  ComposeThreadRouteName,
];
