// @flow

import type { CalendarInfo } from 'lib/model/calendar-info';
import { calendarInfoPropType } from 'lib/model/calendar-info';
import type { UpdateStore } from 'lib/model/redux-reducer';
import type { AppState, NavInfo } from '../redux-types';
import type { LoadingStatus } from '../loading-indicator.react';

import React from 'react';
import classNames from 'classnames';
import TextTruncate from 'react-text-truncate';
import { connect } from 'react-redux';
import invariant from 'invariant';
import update from 'immutability-helper';

import { currentNavID } from 'lib/shared/nav-utils';
import { mapStateToUpdateStore } from 'lib/shared/redux-utils'
import fetchJSON from 'lib/utils/fetch-json';
import * as TypeaheadText from 'lib/shared/typeahead-text';

import css from '../style.css';
import TypeaheadOptionButtons from './typeahead-option-buttons.react';
import { monthURL } from '../url-utils';
import history from '../router-history';
import LoadingIndicator from '../loading-indicator.react';

type Props = {
  calendarInfo?: CalendarInfo,
  secretCalendarID?: string,
  monthURL: string,
  currentNavID: ?string,
  currentCalendarID: ?string,
  freezeTypeahead: (navID: string) => void,
  unfreezeTypeahead: (navID: string) => void,
  focusTypeahead: () => void,
  onTransition: () => void,
  frozen?: bool,
  setModal: (modal: React.Element<any>) => void,
  clearModal: () => void,
  typeaheadFocused: bool,
  updateStore: UpdateStore<NavInfo, AppState>,
};
type State = {
  passwordEntryValue: string,
  passwordEntryOpen: bool,
  passwordEntryLoadingStatus: LoadingStatus,
};

class TypeaheadCalendarOption extends React.Component {

  static defaultProps = { frozen: false };
  props: Props;
  state: State;

  passwordEntryInput: ?HTMLInputElement;

  constructor(props: Props) {
    super(props);
    this.state = {
      passwordEntryValue: "",
      passwordEntryOpen:
        TypeaheadCalendarOption.forCurrentAndUnauthorizedCalendar(props),
      passwordEntryLoadingStatus: "inactive",
    };
  }

  // This function tells you if the calendar this nav option represents is the
  // one we are currently navigated to, AND we aren't authorized to view it, AND
  // this nav option isn't being shown as part of search results.
  static forCurrentAndUnauthorizedCalendar(props: Props) {
    return !props.currentNavID &&
      props.currentCalendarID === TypeaheadCalendarOption.getID(props) &&
      !props.typeaheadFocused;
  }

  componentDidMount() {
    if (TypeaheadCalendarOption.forCurrentAndUnauthorizedCalendar(this.props)) {
      this.props.freezeTypeahead(TypeaheadCalendarOption.getID(this.props));
      this.focusPasswordEntry();
    }
  }

  componentWillUnmount() {
    this.props.unfreezeTypeahead(TypeaheadCalendarOption.getID(this.props));
  }

  focusPasswordEntry() {
    invariant(
      this.passwordEntryInput instanceof HTMLInputElement,
      "passwordEntryInput ref not set",
    );
    this.passwordEntryInput.focus();
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (this.state.passwordEntryOpen && !prevState.passwordEntryOpen) {
      this.focusPasswordEntry();
    }
  }

  render() {
    let descriptionDiv = null;
    if (this.props.calendarInfo && this.props.calendarInfo.description) {
      descriptionDiv = (
        <div className={css['calendar-nav-option-description']}>
          <TextTruncate
            line={2}
            text={this.props.calendarInfo.description}
          />
        </div>
      );
    }
    let passwordEntry = null;
    if (this.state.passwordEntryOpen) {
      passwordEntry =
        <div className={css['calendar-password-entry']}>
          <input
            type="submit"
            value="Enter"
            className={css['calendar-password-entry-submit']}
            onClick={this.onSubmitPassword.bind(this)}
            disabled={this.state.passwordEntryLoadingStatus === "loading"}
          />
          <LoadingIndicator
            status={this.state.passwordEntryLoadingStatus}
            className={css['calendar-pasword-entry-loading']}
          />
          <div className={css['calendar-password-entry-input-container']}>
            <input
              type="password"
              className={css['calendar-password-entry-input']}
              value={this.state.passwordEntryValue}
              onChange={this.onPasswordEntryChange.bind(this)}
              onBlur={this.onPasswordEntryBlur.bind(this)}
              onKeyDown={this.onPasswordEntryKeyDown.bind(this)}
              onMouseDown={this.onPasswordEntryMouseDown.bind(this)}
              placeholder="Password"
              ref={(input) => this.passwordEntryInput = input}
            />
          </div>
        </div>;
    }
    let colorPreview = null;
    let optionButtons = null;
    let name = null;
    if (this.props.calendarInfo) {
      const colorPreviewStyle = {
        backgroundColor: "#" + this.props.calendarInfo.color,
      };
      colorPreview = (
        <div
          className={css['calendar-nav-color-preview']}
          style={colorPreviewStyle}
        />
      );
      optionButtons = (
        <TypeaheadOptionButtons
          calendarInfo={this.props.calendarInfo}
          setModal={this.props.setModal}
          clearModal={this.props.clearModal}
          freezeTypeahead={this.props.freezeTypeahead}
          unfreezeTypeahead={this.props.unfreezeTypeahead}
          focusTypeahead={this.props.focusTypeahead}
        />
      );
      name = this.props.calendarInfo.name;
    } else {
      name = TypeaheadText.secretText;
    }
    return (
      <div
        className={classNames({
          [css['calendar-nav-option']]: true,
          [css['calendar-nav-open-option']]: this.state.passwordEntryOpen,
          [css['calendar-nav-frozen-option']]: this.props.frozen ||
            this.state.passwordEntryOpen,
        })}
        onClick={this.onClick.bind(this)}
      >
        {colorPreview}
        <div>
          {optionButtons}
          <div className={css['calendar-nav-option-name']}>
            {name}
          </div>
        </div>
        {descriptionDiv}
        {passwordEntry}
      </div>
    );
  }

  static getID(props: Props) {
    const id = props.calendarInfo
      ? props.calendarInfo.id
      : props.secretCalendarID;
    invariant(id, "id should exist");
    return id;
  }

  async onClick(event: SyntheticEvent) {
    const id = TypeaheadCalendarOption.getID(this.props);
    if (this.props.calendarInfo && this.props.calendarInfo.authorized) {
      history.push(`calendar/${id}/${this.props.monthURL}`);
      this.props.onTransition();
    } else {
      this.props.freezeTypeahead(id);
      this.setState({ passwordEntryOpen: true });
    }
  }

  onPasswordEntryChange(event: SyntheticEvent) {
    const target = event.target;
    invariant(target instanceof HTMLInputElement, "target not input");
    this.setState({ passwordEntryValue: target.value });
  }

  onPasswordEntryBlur(event: SyntheticEvent) {
    this.setState({ passwordEntryOpen: false });
    this.props.unfreezeTypeahead(TypeaheadCalendarOption.getID(this.props));
  }

  // Throw away typechecking here because SyntheticEvent isn't typed
  async onPasswordEntryKeyDown(event: any) {
    if (event.keyCode === 27) {
      invariant(
        this.passwordEntryInput instanceof HTMLInputElement,
        "passwordEntryInput ref not set",
      );
      this.passwordEntryInput.blur();
    } else if (event.keyCode === 13) {
      await this.onSubmitPassword(event);
    }
  }

  onPasswordEntryMouseDown(event: SyntheticEvent) {
    event.stopPropagation();
  }

  async onSubmitPassword(event: SyntheticEvent) {
    event.preventDefault();

    this.setState({ passwordEntryLoadingStatus: "loading" });
    const id = TypeaheadCalendarOption.getID(this.props);
    const response = await fetchJSON('auth_calendar.php', {
      'calendar': id,
      'password': this.state.passwordEntryValue,
    });
    if (response.success) {
      this.setState({ passwordEntryLoadingStatus: "inactive" });
      this.props.updateStore((prevState: AppState) => {
        const updateObj = {};
        updateObj[id] = { $set: response.calendar_info };
        return update(prevState, {
          calendarInfos: updateObj,
        });
      });
      this.props.unfreezeTypeahead(id);
      this.props.onTransition();
      if (this.props.currentCalendarID !== id) {
        history.push(
          `calendar/${id}/${this.props.monthURL}`,
        );
      }
    } else {
      this.setState(
        {
          passwordEntryLoadingStatus: "error",
          passwordEntryValue: "",
        },
        this.focusPasswordEntry.bind(this),
      );
    }
  }

}

TypeaheadCalendarOption.propTypes = {
  calendarInfo: calendarInfoPropType,
  secretCalendarID: React.PropTypes.string,
  monthURL: React.PropTypes.string.isRequired,
  currentNavID: React.PropTypes.string,
  currentCalendarID: React.PropTypes.string,
  freezeTypeahead: React.PropTypes.func.isRequired,
  unfreezeTypeahead: React.PropTypes.func.isRequired,
  focusTypeahead: React.PropTypes.func.isRequired,
  onTransition: React.PropTypes.func.isRequired,
  frozen: React.PropTypes.bool,
  setModal: React.PropTypes.func.isRequired,
  clearModal: React.PropTypes.func.isRequired,
  typeaheadFocused: React.PropTypes.bool.isRequired,
  updateStore: React.PropTypes.func.isRequired,
};

export default connect(
  (state: AppState) => ({
    monthURL: monthURL(state),
    currentNavID: currentNavID(state),
    currentCalendarID: state.navInfo.calendarID,
  }),
  mapStateToUpdateStore,
)(TypeaheadCalendarOption);
