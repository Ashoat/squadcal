// @flow

import type { HeaderProps } from 'react-navigation-stack';

import * as React from 'react';

import Header from '../navigation/header.react';
import { createActiveTabSelector } from '../navigation/nav-selectors';
import { ChatRouteName } from '../navigation/route-names';
import {
  connectNav,
  type NavContextType,
} from '../navigation/navigation-context';

const activeTabSelector = createActiveTabSelector(ChatRouteName);

const ChatHeader = connectNav((context: ?NavContextType) => ({
  activeTab: activeTabSelector(context),
}))(Header);

// eslint-disable-next-line react/display-name
export default (props: $Exact<HeaderProps>) => <ChatHeader {...props} />;
