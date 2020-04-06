// @flow

import type { BaseAction } from '../types/redux-types';
import {
  logOutActionTypes,
  deleteAccountActionTypes,
  logInActionTypes,
  registerActionTypes,
  resetPasswordActionTypes,
} from '../actions/user-actions';
import { setNewSessionActionType } from '../utils/action-utils';

export default function reduceDataLoaded(state: boolean, action: BaseAction) {
  if (
    action.type === logInActionTypes.success ||
    action.type === resetPasswordActionTypes.success ||
    action.type === registerActionTypes.success
  ) {
    return true;
  } else if (
    action.type === setNewSessionActionType &&
    action.payload.sessionChange.currentUserInfo &&
    action.payload.sessionChange.currentUserInfo.anonymous
  ) {
    return false;
  } else if (
    action.type === logOutActionTypes.success ||
    action.type === deleteAccountActionTypes.success
  ) {
    return false;
  }
  return state;
}
