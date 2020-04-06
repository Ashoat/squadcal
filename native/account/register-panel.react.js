// @flow

import type { DispatchActionPromise } from 'lib/utils/action-utils';
import type { AppState } from '../redux/redux-setup';
import type { LoadingStatus } from 'lib/types/loading-types';
import type {
  RegisterInfo,
  LogInExtraInfo,
  RegisterResult,
  LogInStartingPayload,
} from 'lib/types/account-types';
import {
  type StateContainer,
  stateContainerPropType,
} from '../utils/state-container';

import React from 'react';
import {
  View,
  StyleSheet,
  Platform,
  Keyboard,
  Alert,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import invariant from 'invariant';
import OnePassword from 'react-native-onepassword';
import PropTypes from 'prop-types';

import { connect } from 'lib/utils/redux-utils';
import { registerActionTypes, register } from 'lib/actions/user-actions';
import { createLoadingStatusSelector } from 'lib/selectors/loading-selectors';
import { validUsernameRegex, validEmailRegex } from 'lib/shared/account-utils';

import { TextInput } from './modal-components.react';
import {
  PanelButton,
  PanelOnePasswordButton,
  Panel,
} from './panel-components.react';
import { setNativeCredentials } from './native-credentials';
import { nativeLogInExtraInfoSelector } from '../selectors/account-selectors';
import {
  connectNav,
  type NavContextType,
} from '../navigation/navigation-context';

export type RegisterState = {
  usernameInputText: string,
  emailInputText: string,
  passwordInputText: string,
  confirmPasswordInputText: string,
};
type Props = {
  setActiveAlert: (activeAlert: boolean) => void,
  opacityValue: Animated.Value,
  onePasswordSupported: boolean,
  state: StateContainer<RegisterState>,
  // Redux state
  loadingStatus: LoadingStatus,
  logInExtraInfo: () => LogInExtraInfo,
  // Redux dispatch functions
  dispatchActionPromise: DispatchActionPromise,
  // async functions that hit server APIs
  register: (registerInfo: RegisterInfo) => Promise<RegisterResult>,
};
class RegisterPanel extends React.PureComponent<Props> {
  static propTypes = {
    setActiveAlert: PropTypes.func.isRequired,
    opacityValue: PropTypes.object.isRequired,
    onePasswordSupported: PropTypes.bool.isRequired,
    state: stateContainerPropType.isRequired,
    loadingStatus: PropTypes.string.isRequired,
    logInExtraInfo: PropTypes.func.isRequired,
    dispatchActionPromise: PropTypes.func.isRequired,
    register: PropTypes.func.isRequired,
  };
  usernameInput: ?TextInput;
  emailInput: ?TextInput;
  passwordInput: ?TextInput;
  confirmPasswordInput: ?TextInput;

  render() {
    let onePassword = null;
    let passwordStyle = {};
    if (this.props.onePasswordSupported) {
      onePassword = (
        <PanelOnePasswordButton onPress={this.onPressOnePassword} />
      );
      passwordStyle = { paddingRight: 30 };
    }
    return (
      <Panel opacityValue={this.props.opacityValue} style={styles.container}>
        <View>
          <Icon name="user" size={22} color="#777" style={styles.icon} />
          <TextInput
            style={styles.input}
            value={this.props.state.state.usernameInputText}
            onChangeText={this.onChangeUsernameInputText}
            placeholder="Username"
            autoFocus={true}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="ascii-capable"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={this.focusEmailInput}
            editable={this.props.loadingStatus !== 'loading'}
            ref={this.usernameInputRef}
          />
        </View>
        <View>
          <Icon
            name="envelope"
            size={18}
            color="#777"
            style={[styles.icon, styles.envelopeIcon]}
          />
          <TextInput
            style={styles.input}
            value={this.props.state.state.emailInputText}
            onChangeText={this.onChangeEmailInputText}
            placeholder="Email address"
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={this.focusPasswordInput}
            editable={this.props.loadingStatus !== 'loading'}
            ref={this.emailInputRef}
          />
        </View>
        <View>
          <Icon name="lock" size={22} color="#777" style={styles.icon} />
          <TextInput
            style={[styles.input, passwordStyle]}
            value={this.props.state.state.passwordInputText}
            onChangeText={this.onChangePasswordInputText}
            placeholder="Password"
            secureTextEntry={true}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={this.focusConfirmPasswordInput}
            editable={this.props.loadingStatus !== 'loading'}
            ref={this.passwordInputRef}
          />
          {onePassword}
        </View>
        <View>
          <TextInput
            style={styles.input}
            value={this.props.state.state.confirmPasswordInputText}
            onChangeText={this.onChangeConfirmPasswordInputText}
            placeholder="Confirm password"
            secureTextEntry={true}
            returnKeyType="go"
            blurOnSubmit={false}
            onSubmitEditing={this.onSubmit}
            editable={this.props.loadingStatus !== 'loading'}
            ref={this.confirmPasswordInputRef}
          />
        </View>
        <PanelButton
          text="SIGN UP"
          loadingStatus={this.props.loadingStatus}
          onSubmit={this.onSubmit}
        />
      </Panel>
    );
  }

  usernameInputRef = (usernameInput: ?TextInput) => {
    this.usernameInput = usernameInput;
  };

  emailInputRef = (emailInput: ?TextInput) => {
    this.emailInput = emailInput;
  };

  passwordInputRef = (passwordInput: ?TextInput) => {
    this.passwordInput = passwordInput;
  };

  confirmPasswordInputRef = (confirmPasswordInput: ?TextInput) => {
    this.confirmPasswordInput = confirmPasswordInput;
  };

  focusEmailInput = () => {
    invariant(this.emailInput, 'ref should be set');
    this.emailInput.focus();
  };

  focusPasswordInput = () => {
    invariant(this.passwordInput, 'ref should be set');
    this.passwordInput.focus();
  };

  focusConfirmPasswordInput = () => {
    invariant(this.confirmPasswordInput, 'ref should be set');
    this.confirmPasswordInput.focus();
  };

  onChangeUsernameInputText = (text: string) => {
    this.props.state.setState({ usernameInputText: text });
  };

  onChangeEmailInputText = (text: string) => {
    this.props.state.setState({ emailInputText: text });
  };

  onChangePasswordInputText = (text: string) => {
    this.props.state.setState({ passwordInputText: text });
  };

  onChangeConfirmPasswordInputText = (text: string) => {
    this.props.state.setState({ confirmPasswordInputText: text });
  };

  onSubmit = () => {
    this.props.setActiveAlert(true);
    if (this.props.state.state.passwordInputText === '') {
      Alert.alert(
        'Empty password',
        'Password cannot be empty',
        [{ text: 'OK', onPress: this.onPasswordAlertAcknowledged }],
        { cancelable: false },
      );
    } else if (
      this.props.state.state.passwordInputText !==
      this.props.state.state.confirmPasswordInputText
    ) {
      Alert.alert(
        "Passwords don't match",
        'Password fields must contain the same password',
        [{ text: 'OK', onPress: this.onPasswordAlertAcknowledged }],
        { cancelable: false },
      );
    } else if (
      this.props.state.state.usernameInputText.search(validUsernameRegex) === -1
    ) {
      Alert.alert(
        'Invalid username',
        'Alphanumeric usernames only',
        [{ text: 'OK', onPress: this.onUsernameAlertAcknowledged }],
        { cancelable: false },
      );
    } else if (
      this.props.state.state.emailInputText.search(validEmailRegex) === -1
    ) {
      Alert.alert(
        'Invalid email address',
        'Valid email addresses only',
        [{ text: 'OK', onPress: this.onEmailAlertAcknowledged }],
        { cancelable: false },
      );
    } else {
      Keyboard.dismiss();
      const extraInfo = this.props.logInExtraInfo();
      this.props.dispatchActionPromise(
        registerActionTypes,
        this.registerAction(extraInfo),
        undefined,
        ({ calendarQuery: extraInfo.calendarQuery }: LogInStartingPayload),
      );
    }
  };

  onPasswordAlertAcknowledged = () => {
    this.props.setActiveAlert(false);
    this.props.state.setState(
      {
        passwordInputText: '',
        confirmPasswordInputText: '',
      },
      () => {
        invariant(this.passwordInput, 'ref should exist');
        this.passwordInput.focus();
      },
    );
  };

  onUsernameAlertAcknowledged = () => {
    this.props.setActiveAlert(false);
    this.props.state.setState(
      {
        usernameInputText: '',
      },
      () => {
        invariant(this.usernameInput, 'ref should exist');
        this.usernameInput.focus();
      },
    );
  };

  onEmailAlertAcknowledged = () => {
    this.props.setActiveAlert(false);
    this.props.state.setState(
      {
        emailInputText: '',
      },
      () => {
        invariant(this.emailInput, 'ref should exist');
        this.emailInput.focus();
      },
    );
  };

  async registerAction(extraInfo: LogInExtraInfo) {
    try {
      const result = await this.props.register({
        username: this.props.state.state.usernameInputText,
        email: this.props.state.state.emailInputText,
        password: this.props.state.state.passwordInputText,
        ...extraInfo,
      });
      this.props.setActiveAlert(false);
      await setNativeCredentials({
        username: result.currentUserInfo.username,
        password: this.props.state.state.passwordInputText,
      });
      return result;
    } catch (e) {
      if (e.message === 'username_taken') {
        Alert.alert(
          'Username taken',
          'An account with that username already exists',
          [{ text: 'OK', onPress: this.onUsernameAlertAcknowledged }],
          { cancelable: false },
        );
      } else if (e.message === 'email_taken') {
        Alert.alert(
          'Email taken',
          'An account with that email already exists',
          [{ text: 'OK', onPress: this.onEmailAlertAcknowledged }],
          { cancelable: false },
        );
      } else if (e.message === 'client_version_unsupported') {
        const app = Platform.select({
          ios: 'Testflight',
          android: 'Play Store',
        });
        Alert.alert(
          'App out of date',
          "Your app version is pretty old, and the server doesn't know how " +
            `to speak to it anymore. Please use the ${app} app to update!`,
          [{ text: 'OK', onPress: this.onAppOutOfDateAlertAcknowledged }],
          { cancelable: false },
        );
      } else {
        Alert.alert(
          'Unknown error',
          'Uhh... try again?',
          [{ text: 'OK', onPress: this.onUnknownErrorAlertAcknowledged }],
          { cancelable: false },
        );
      }
      throw e;
    }
  }

  onUnknownErrorAlertAcknowledged = () => {
    this.props.setActiveAlert(false);
    this.props.state.setState(
      {
        usernameInputText: '',
        emailInputText: '',
        passwordInputText: '',
        confirmPasswordInputText: '',
      },
      () => {
        invariant(this.usernameInput, 'ref should exist');
        this.usernameInput.focus();
      },
    );
  };

  onAppOutOfDateAlertAcknowledged = () => {
    this.props.setActiveAlert(false);
  };

  onPressOnePassword = async () => {
    try {
      const credentials = await OnePassword.findLogin('https://squadcal.org');
      this.props.state.setState({
        usernameInputText: credentials.username,
        passwordInputText: credentials.password,
        confirmPasswordInputText: credentials.password,
      });
      if (this.props.state.state.emailInputText) {
        this.onSubmit();
      } else {
        invariant(this.emailInput, 'ref should exist');
        this.emailInput.focus();
      }
    } catch (e) {}
  };
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Platform.OS === 'ios' ? 37 : 36,
    zIndex: 2,
  },
  envelopeIcon: {
    bottom: 10,
    left: 3,
  },
  icon: {
    bottom: 8,
    left: 4,
    position: 'absolute',
  },
  input: {
    paddingLeft: 35,
  },
});

const loadingStatusSelector = createLoadingStatusSelector(registerActionTypes);

export default connectNav((context: ?NavContextType) => ({
  navContext: context,
}))(
  connect(
    (state: AppState, ownProps: { navContext: ?NavContextType }) => ({
      loadingStatus: loadingStatusSelector(state),
      logInExtraInfo: nativeLogInExtraInfoSelector({
        redux: state,
        navContext: ownProps.navContext,
      }),
    }),
    { register },
  )(RegisterPanel),
);
