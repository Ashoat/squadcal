// @flow

import type { AppState } from '../redux-setup';
import {
  type ConnectionStatus,
  connectionStatusPropType,
} from 'lib/types/socket-types';

import * as React from 'react';
import { View, Text, StyleSheet, LayoutAnimation, NetInfo } from 'react-native';
import PropTypes from 'prop-types';

import { connect } from 'lib/utils/redux-utils';

type Props = {|
  connectionStatus: ConnectionStatus,
  someRequestIsLate: bool,
|};
type State = {|
  disconnected: bool,
|};
class DisconnectedBar extends React.PureComponent<Props, State> {

  static propTypes = {
    connectionStatus: connectionStatusPropType.isRequired,
    someRequestIsLate: PropTypes.bool.isRequired,
  };
  state = {
    disconnected: false,
  };
  networkActive = true;

  componentDidMount() {
    NetInfo.isConnected.addEventListener(
      'connectionChange',
      this.handleConnectionChange,
    );
    NetInfo.isConnected.fetch().then(this.handleConnectionChange);
  }

  componentWillUnmount() {
    NetInfo.isConnected.removeEventListener(
      'connectionChange',
      this.handleConnectionChange,
    );
  }

  handleConnectionChange = isConnected => {
    this.networkActive = isConnected;
    if (!this.networkActive && !this.state.disconnected) {
      this.setState({ disconnected: true });
    }
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    const { connectionStatus: status, someRequestIsLate } = this.props;

    let newDisconnected;
    if (status === "connected" && prevProps.connectionStatus !== "connected") {
      // Sometimes NetInfo misses the network coming back online for some
      // reason. But if the socket reconnects, the network must be up
      this.networkActive = true;
      newDisconnected = false;
    } else if (!this.networkActive || someRequestIsLate) {
      newDisconnected = true;
    } else if (status === "reconnecting" || status === "forcedDisconnecting") {
      newDisconnected = true;
    } else if (status === "connected") {
      newDisconnected = false;
    }

    const { disconnected } = this.state;
    if (newDisconnected !== undefined && newDisconnected !== disconnected) {
      this.setState({ disconnected: newDisconnected });
    }

    if (disconnected !== prevState.disconnected) {
      LayoutAnimation.easeInEaseOut();
    }
  }

  render() {
    const { connectionStatus } = this.props;
    const { disconnected } = this.state;

    const disconnectedBarStyles = [ styles.disconnectedBar ];
    let text;
    if (disconnected) {
      text = <Text style={styles.disconnectedText}>DISCONNECTED</Text>;
    } else {
      disconnectedBarStyles.push(styles.hiddenDisconnectedBar);
    }

    return <View style={disconnectedBarStyles}>{text}</View>;
  }

}

const styles = StyleSheet.create({
  disconnectedBar: {
    backgroundColor: '#CC0000',
    padding: 5,
  },
  hiddenDisconnectedBar: {
    height: 0,
    padding: 0,
  },
  disconnectedText: {
    fontSize: 14,
    textAlign: 'center',
    color: 'white',
  },
});

export default connect((state: AppState) => ({
  connectionStatus: state.connection.status,
  someRequestIsLate: state.connection.lateResponses.length !== 0,
}))(DisconnectedBar);
