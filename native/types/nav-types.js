// @flow

import type { BaseNavInfo } from 'lib/types/nav-types';

export type NavInfo = {|
  ...$Exact<BaseNavInfo>,
  +currentTransitionSidebarSourceID?: string,
|};

export const setCurrentTransitionSidebarSourceIDType =
  'SET_CURRENT_TRANSITION_SIDEBAR_SOURCE_ID';
