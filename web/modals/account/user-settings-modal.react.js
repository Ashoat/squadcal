// @flow

import type { AppState } from '../../redux-setup';
import type { DispatchActionPromise } from 'lib/utils/action-utils';

import React from 'react';
import invariant from 'invariant';
import classNames from 'classnames';
import { connect } from 'react-redux';

import { validEmailRegex } from 'lib/shared/account-regexes';
import {
  deleteAccountActionType,
  deleteAccount,
  changeUserSettingsActionType,
  changeUserSettings,
  resendVerificationEmailActionType,
  resendVerificationEmail,
} from 'lib/actions/user-actions';
import { includeDispatchActionProps } from 'lib/utils/action-utils';
import { createLoadingStatusSelector } from 'lib/selectors/loading-selectors';

import css from '../../style.css';
import Modal from '../modal.react';
import VerifyEmailModal from './verify-email-modal.react';

type Tab = "general" | "delete";
type Props = {
  username: string,
  email: string,
  emailVerified: bool,
  inputDisabled: bool,
  onClose: () => void,
  setModal: (modal: React.Element<any>) => void,
  dispatchActionPromise: DispatchActionPromise,
};
type State = {
  email: string,
  emailVerified: ?bool,
  newPassword: string,
  confirmNewPassword: string,
  currentPassword: string,
  errorMessage: string,
  currentTab: Tab,
};

class UserSettingsModal extends React.PureComponent {

  props: Props;
  state: State;
  emailInput: ?HTMLInputElement;
  newPasswordInput: ?HTMLInputElement;
  currentPasswordInput: ?HTMLInputElement;

  constructor(props: Props) {
    super(props);
    this.state = {
      email: props.email,
      emailVerified: props.emailVerified,
      newPassword: "",
      confirmNewPassword: "",
      currentPassword: "",
      errorMessage: "",
      currentTab: "general",
    };
  }

  componentDidMount() {
    invariant(this.emailInput, "email ref unset");
    this.emailInput.focus();
  }

  render() {
    let mainContent = null;
    if (this.state.currentTab === "general") {
      let verificationStatus = null;
      if (this.state.emailVerified === true) {
        verificationStatus = (
          <div
            className={`${css['form-subtitle']} ${css['verified-status-true']}`}
          >Verified</div>
        );
      } else if (this.state.emailVerified === false) {
        verificationStatus = (
          <div className={css['form-subtitle']}>
            <span className={css['verified-status-false']}>Not verified</span>
            {" - "}
            <a href="#" onClick={this.onClickResendVerificationEmail}>
              resend verification email
            </a>
          </div>
        );
      }
      mainContent = (
        <div>
          <div className={css['form-text']}>
            <div className={css['form-title']}>Username</div>
            <div className={css['form-content']}>{this.props.username}</div>
          </div>
          <div>
            <div className={css['form-title']}>Email</div>
            <div className={css['form-content']}>
              <input
                type="text"
                placeholder="Email"
                value={this.state.email}
                onChange={this.onChangeEmail}
                ref={this.emailInputRef}
                disabled={this.props.inputDisabled}
              />
              {verificationStatus}
            </div>
          </div>
          <div>
            <div className={css['form-title']}>New password (optional)</div>
            <div className={css['form-content']}>
              <div>
                <input
                  type="password"
                  placeholder="New password (optional)"
                  value={this.state.newPassword}
                  onChange={this.onChangeNewPassword}
                  ref={this.newPasswordInputRef}
                  disabled={this.props.inputDisabled}
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Confirm new password (optional)"
                  value={this.state.confirmNewPassword}
                  onChange={this.onChangeConfirmNewPassword}
                  disabled={this.props.inputDisabled}
                />
              </div>
            </div>
          </div>
        </div>
      );
    } else if (this.state.currentTab === "delete") {
      mainContent = (
        <p className={css['italic']}>
          Your account will be permanently deleted. There is no way to reverse
          this.
        </p>
      );
    }

    let buttons = null;
    if (this.state.currentTab === "delete") {
      buttons = (
        <span className={css['form-submit']}>
          <input
            type="submit"
            value="Delete account"
            onClick={this.onDelete}
            disabled={this.props.inputDisabled}
          />
        </span>
      );
    } else {
      buttons = (
        <span className={css['form-submit']}>
          <input
            type="submit"
            value="Update account"
            onClick={this.onSubmit}
            disabled={this.props.inputDisabled}
          />
        </span>
      );
    }

    return (
      <Modal name="Edit account" onClose={this.props.onClose} size="large">
        <ul className={css['tab-panel']}>
          {this.buildTab("general", "General")}
          {this.buildTab("delete", "Delete")}
        </ul>
        <div className={css['modal-body']}>
          <form method="POST">
            {mainContent}
            <div className={css['user-settings-current-password']}>
              <p className={css['confirm-account-password']}>
                Please enter your current password to confirm your identity
              </p>
              <div className={css['form-title']}>Current password</div>
              <div className={css['form-content']}>
                <input
                  type="password"
                  placeholder="Current password"
                  value={this.state.currentPassword}
                  onChange={this.onChangeCurrentPassword}
                  disabled={this.props.inputDisabled}
                  ref={this.currentPasswordInputRef}
                />
              </div>
            </div>
            <div className={css['form-footer']}>
              <span className={css['modal-form-error']}>
                {this.state.errorMessage}
              </span>
              {buttons}
            </div>
          </form>
        </div>
      </Modal>
    );
  }

  emailInputRef = (emailInput: ?HTMLInputElement) => {
    this.emailInput = emailInput;
  }

  newPasswordInputRef = (newPasswordInput: ?HTMLInputElement) => {
    this.newPasswordInput = newPasswordInput;
  }

  currentPasswordInputRef = (currentPasswordInput: ?HTMLInputElement) => {
    this.currentPasswordInput = currentPasswordInput;
  }

  buildTab(tab: Tab, name: string) {
    const currentTab = this.state.currentTab;
    const classNamesForTab = classNames({
      [css['current-tab']]: currentTab === tab,
      [css['delete-tab']]: currentTab === tab && tab === "delete",
    });
    return (
      <li
        className={classNamesForTab}
        onClick={(e) => this.setState({ "currentTab": tab })}
      >
        <a>{name}</a>
      </li>
    );
  }

  onChangeEmail = (event: SyntheticEvent) => {
    const target = event.target;
    invariant(target instanceof HTMLInputElement, "target not input");
    this.setState({
      email: target.value,
      emailVerified: target.value === this.props.email
        ? this.props.emailVerified
        : null,
    });
  }

  onChangeNewPassword = (event: SyntheticEvent) => {
    const target = event.target;
    invariant(target instanceof HTMLInputElement, "target not input");
    this.setState({ newPassword: target.value });
  }

  onChangeConfirmNewPassword = (event: SyntheticEvent) => {
    const target = event.target;
    invariant(target instanceof HTMLInputElement, "target not input");
    this.setState({ confirmNewPassword: target.value });
  }

  onChangeCurrentPassword = (event: SyntheticEvent) => {
    const target = event.target;
    invariant(target instanceof HTMLInputElement, "target not input");
    this.setState({ currentPassword: target.value });
  }

  onClickResendVerificationEmail = (event: SyntheticEvent) => {
    event.preventDefault();
    this.props.dispatchActionPromise(
      resendVerificationEmailActionType,
      this.resendVerificationEmailAction(),
    );
  }

  async resendVerificationEmailAction() {
    await resendVerificationEmail();
    this.props.setModal(<VerifyEmailModal onClose={this.props.onClose} />);
  }

  onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();

    if (this.state.newPassword !== this.state.confirmNewPassword) {
      this.setState(
        {
          newPassword: "",
          confirmNewPassword: "",
          errorMessage: "passwords don't match",
        },
        () => {
          invariant(this.newPasswordInput, "newPasswordInput ref unset");
          this.newPasswordInput.focus();
        },
      );
      return;
    }

    if (this.state.email.search(validEmailRegex) === -1) {
      this.setState(
        {
          email: "",
          errorMessage: "invalid email address",
        },
        () => {
          invariant(this.emailInput, "emailInput ref unset");
          this.emailInput.focus();
        },
      );
      return;
    }

    this.props.dispatchActionPromise(
      changeUserSettingsActionType,
      this.changeUserSettingsAction(),
    );
  }

  async changeUserSettingsAction() {
    const email = this.state.email;
    try {
      const result = await changeUserSettings(
        this.state.currentPassword,
        email,
        this.state.newPassword,
      );
      if (email !== this.props.email) {
        this.props.setModal(<VerifyEmailModal onClose={this.props.onClose} />);
      } else {
        this.props.onClose();
      }
      return result;
    } catch (e) {
      if (e.message === 'invalid_credentials') {
        this.setState(
          {
            currentPassword: "",
            errorMessage: "wrong current password",
          },
          () => {
            invariant(
              this.currentPasswordInput,
              "currentPasswordInput ref unset",
            );
            this.currentPasswordInput.focus();
          },
        );
      } else if (e.message === 'email_taken') {
        this.setState(
          {
            email: this.props.email,
            emailVerified: this.props.emailVerified,
            errorMessage: "email already taken",
          },
          () => {
            invariant(this.emailInput, "emailInput ref unset");
            this.emailInput.focus();
          },
        );
      } else {
        this.setState(
          {
            email: this.props.email,
            emailVerified: this.props.emailVerified,
            newPassword: "",
            confirmNewPassword: "",
            currentPassword: "",
            errorMessage: "unknown error",
          },
          () => {
            invariant(this.emailInput, "emailInput ref unset");
            this.emailInput.focus();
          },
        );
      }
      throw e;
    }
  }

  onDelete = (event: SyntheticEvent) => {
    event.preventDefault();
    this.props.dispatchActionPromise(
      deleteAccountActionType,
      this.deleteAction(),
    );
  }

  async deleteAction() {
    try {
      const response = await deleteAccount(this.state.currentPassword);
      this.props.onClose();
      return response;
    } catch(e) {
      const errorMessage = e.message === "invalid_credentials"
        ? "wrong password"
        : "unknown error";
      this.setState(
        {
          currentPassword: "",
          errorMessage: errorMessage,
        },
        () => {
          invariant(
            this.currentPasswordInput,
            "currentPasswordInput ref unset",
          );
          this.currentPasswordInput.focus();
        },
      );
      throw e;
    }
  }

}

UserSettingsModal.propTypes = {
  username: React.PropTypes.string.isRequired,
  email: React.PropTypes.string.isRequired,
  emailVerified: React.PropTypes.bool.isRequired,
  inputDisabled: React.PropTypes.bool.isRequired,
  onClose: React.PropTypes.func.isRequired,
  setModal: React.PropTypes.func.isRequired,
  dispatchActionPromise: React.PropTypes.func.isRequired,
};

const deleteAccountLoadingStatusSelector
  = createLoadingStatusSelector(deleteAccountActionType);
const changeUserSettingsLoadingStatusSelector
  = createLoadingStatusSelector(changeUserSettingsActionType);
const resendVerificationEmailLoadingStatusSelector
  = createLoadingStatusSelector(resendVerificationEmailActionType);

export default connect(
  (state: AppState) => ({
    username: state.userInfo && state.userInfo.username,
    email: state.userInfo && state.userInfo.email,
    emailVerified: state.userInfo && state.userInfo.emailVerified,
    inputDisabled: deleteAccountLoadingStatusSelector(state) === "loading" ||
      changeUserSettingsLoadingStatusSelector(state) === "loading" ||
      resendVerificationEmailLoadingStatusSelector(state) === "loading",
  }),
  includeDispatchActionProps({ dispatchActionPromise: true }),
)(UserSettingsModal);
