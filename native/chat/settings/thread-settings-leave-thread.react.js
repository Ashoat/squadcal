// @flow

import type { ThreadInfo, LeaveThreadPayload } from 'lib/types/thread-types';
import type { LoadingStatus } from 'lib/types/loading-types';
import type { ViewStyle } from '../../types/styles';

import * as React from 'react';
import { Text, Alert, ActivityIndicator, View } from 'react-native';
import invariant from 'invariant';

import {
  leaveThreadActionTypes,
  leaveThread,
} from 'lib/actions/thread-actions';
import { createLoadingStatusSelector } from 'lib/selectors/loading-selectors';
import { otherUsersButNoOtherAdmins } from 'lib/selectors/thread-selectors';
import { identifyInvalidatedThreads } from 'lib/shared/thread-utils';
import {
  type DispatchActionPromise,
  useServerCall,
  useDispatchActionPromise,
} from 'lib/utils/action-utils';

import Button from '../../components/button.react';
import { type Colors, useColors, useStyles } from '../../themes/colors';
import {
  NavContext,
  type NavContextType,
} from '../../navigation/navigation-context';
import { clearThreadsActionType } from '../../navigation/action-types';
import { useSelector } from '../../redux/redux-utils';

type BaseProps = {|
  +threadInfo: ThreadInfo,
  +buttonStyle: ViewStyle,
|};
type Props = {|
  ...BaseProps,
  // Redux state
  +loadingStatus: LoadingStatus,
  +otherUsersButNoOtherAdmins: boolean,
  +colors: Colors,
  +styles: typeof unboundStyles,
  // Redux dispatch functions
  +dispatchActionPromise: DispatchActionPromise,
  // async functions that hit server APIs
  +leaveThread: (threadID: string) => Promise<LeaveThreadPayload>,
  // withNavContext
  +navContext: ?NavContextType,
|};
class ThreadSettingsLeaveThread extends React.PureComponent<Props> {
  render() {
    const {
      panelIosHighlightUnderlay,
      panelForegroundSecondaryLabel,
    } = this.props.colors;
    const loadingIndicator =
      this.props.loadingStatus === 'loading' ? (
        <ActivityIndicator size="small" color={panelForegroundSecondaryLabel} />
      ) : null;
    return (
      <View style={this.props.styles.container}>
        <Button
          onPress={this.onPress}
          style={[this.props.styles.button, this.props.buttonStyle]}
          iosFormat="highlight"
          iosHighlightUnderlayColor={panelIosHighlightUnderlay}
        >
          <Text style={this.props.styles.text}>Leave thread...</Text>
          {loadingIndicator}
        </Button>
      </View>
    );
  }

  onPress = () => {
    if (this.props.otherUsersButNoOtherAdmins) {
      Alert.alert(
        'Need another admin',
        'Make somebody else an admin before you leave!',
        undefined,
        { cancelable: true },
      );
      return;
    }

    Alert.alert(
      'Confirm action',
      'Are you sure you want to leave this thread?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'OK', onPress: this.onConfirmLeaveThread },
      ],
      { cancelable: true },
    );
  };

  onConfirmLeaveThread = () => {
    this.props.dispatchActionPromise(
      leaveThreadActionTypes,
      this.leaveThread(),
    );
  };

  async leaveThread() {
    const threadID = this.props.threadInfo.id;
    const { navContext } = this.props;
    invariant(navContext, 'navContext should exist in leaveThread');
    navContext.dispatch({
      type: clearThreadsActionType,
      payload: { threadIDs: [threadID] },
    });
    try {
      const result = await this.props.leaveThread(threadID);
      const invalidated = identifyInvalidatedThreads(
        result.updatesResult.newUpdates,
      );
      navContext.dispatch({
        type: clearThreadsActionType,
        payload: { threadIDs: [...invalidated] },
      });
      return result;
    } catch (e) {
      Alert.alert('Unknown error', 'Uhh... try again?', undefined, {
        cancelable: true,
      });
      throw e;
    }
  }
}

const unboundStyles = {
  button: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  container: {
    backgroundColor: 'panelForeground',
    paddingHorizontal: 12,
  },
  text: {
    color: 'redText',
    flex: 1,
    fontSize: 16,
  },
};

const loadingStatusSelector = createLoadingStatusSelector(
  leaveThreadActionTypes,
);

export default React.memo<BaseProps>(
  function ConnectedThreadSettingsLeaveThread(props: BaseProps) {
    const loadingStatus = useSelector(loadingStatusSelector);
    const otherUsersButNoOtherAdminsValue = useSelector(
      otherUsersButNoOtherAdmins(props.threadInfo.id),
    );
    const colors = useColors();
    const styles = useStyles(unboundStyles);
    const dispatchActionPromise = useDispatchActionPromise();
    const callLeaveThread = useServerCall(leaveThread);
    const navContext = React.useContext(NavContext);
    return (
      <ThreadSettingsLeaveThread
        {...props}
        loadingStatus={loadingStatus}
        otherUsersButNoOtherAdmins={otherUsersButNoOtherAdminsValue}
        colors={colors}
        styles={styles}
        dispatchActionPromise={dispatchActionPromise}
        leaveThread={callLeaveThread}
        navContext={navContext}
      />
    );
  },
);
