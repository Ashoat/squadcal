// @flow

import type { EntryInfoWithHeight } from './calendar.react';
import {
  entryInfoPropType,
  type CreateEntryInfo,
  type SaveEntryInfo,
  type SaveEntryResult,
  type CreateEntryPayload,
  type DeleteEntryInfo,
  type DeleteEntryPayload,
  type CalendarQuery,
} from 'lib/types/entry-types';
import type { ThreadInfo } from 'lib/types/thread-types';
import { threadInfoPropType } from 'lib/types/thread-types';
import type { AppState } from '../redux/redux-setup';
import type {
  DispatchActionPayload,
  DispatchActionPromise,
} from 'lib/utils/action-utils';
import type { LoadingStatus } from 'lib/types/loading-types';
import type { LayoutEvent } from '../types/react-native';
import type { TabNavigationProp } from '../navigation/app-navigator.react';

import * as React from 'react';
import {
  View,
  Text,
  TextInput,
  Platform,
  TouchableWithoutFeedback,
  Alert,
  LayoutAnimation,
  Keyboard,
} from 'react-native';
import PropTypes from 'prop-types';
import invariant from 'invariant';
import shallowequal from 'shallowequal';
import _omit from 'lodash/fp/omit';
import _isEqual from 'lodash/fp/isEqual';
import Icon from 'react-native-vector-icons/FontAwesome';
import tinycolor from 'tinycolor2';

import { colorIsDark } from 'lib/shared/thread-utils';
import {
  createEntryActionTypes,
  createEntry,
  saveEntryActionTypes,
  saveEntry,
  deleteEntryActionTypes,
  deleteEntry,
  concurrentModificationResetActionType,
} from 'lib/actions/entry-actions';
import { connect } from 'lib/utils/redux-utils';
import { ServerError } from 'lib/utils/errors';
import { entryKey } from 'lib/shared/entry-utils';
import { registerFetchKey } from 'lib/reducers/loading-reducer';
import { dateString } from 'lib/utils/date-utils';
import sleep from 'lib/utils/sleep';

import Button from '../components/button.react';
import {
  MessageListRouteName,
  ThreadPickerModalRouteName,
} from '../navigation/route-names';
import {
  createIsForegroundSelector,
  nonThreadCalendarQuery,
} from '../navigation/nav-selectors';
import LoadingIndicator from './loading-indicator.react';
import { colors, styleSelector } from '../themes/colors';
import {
  connectNav,
  type NavContextType,
} from '../navigation/navigation-context';
import { waitForInteractions } from '../utils/interactions';
import Markdown from '../markdown/markdown.react';

function hueDistance(firstColor: string, secondColor: string): number {
  const firstHue = tinycolor(firstColor).toHsv().h;
  const secondHue = tinycolor(secondColor).toHsv().h;
  const distance = Math.abs(firstHue - secondHue);
  return distance > 180 ? 360 - distance : distance;
}
const omitEntryInfo = _omit(['entryInfo']);

type Props = {|
  navigation: TabNavigationProp<'Calendar'>,
  entryInfo: EntryInfoWithHeight,
  threadInfo: ThreadInfo,
  visible: boolean,
  active: boolean,
  makeActive: (entryKey: string, active: boolean) => void,
  onEnterEditMode: (entryInfo: EntryInfoWithHeight) => void,
  onConcludeEditMode: (entryInfo: EntryInfoWithHeight) => void,
  onPressWhitespace: () => void,
  entryRef: (entryKey: string, entry: ?InternalEntry) => void,
  // Redux state
  calendarQuery: () => CalendarQuery,
  online: boolean,
  styles: typeof styles,
  // Nav state
  threadPickerActive: boolean,
  // Redux dispatch functions
  dispatchActionPayload: DispatchActionPayload,
  dispatchActionPromise: DispatchActionPromise,
  // async functions that hit server APIs
  createEntry: (info: CreateEntryInfo) => Promise<CreateEntryPayload>,
  saveEntry: (info: SaveEntryInfo) => Promise<SaveEntryResult>,
  deleteEntry: (info: DeleteEntryInfo) => Promise<DeleteEntryPayload>,
|};
type State = {|
  editing: boolean,
  text: string,
  loadingStatus: LoadingStatus,
  height: number,
|};
class InternalEntry extends React.Component<Props, State> {
  static propTypes = {
    navigation: PropTypes.shape({
      navigate: PropTypes.func.isRequired,
      goBack: PropTypes.func.isRequired,
    }).isRequired,
    entryInfo: entryInfoPropType.isRequired,
    threadInfo: threadInfoPropType.isRequired,
    visible: PropTypes.bool.isRequired,
    active: PropTypes.bool.isRequired,
    makeActive: PropTypes.func.isRequired,
    onEnterEditMode: PropTypes.func.isRequired,
    onConcludeEditMode: PropTypes.func.isRequired,
    onPressWhitespace: PropTypes.func.isRequired,
    entryRef: PropTypes.func.isRequired,
    calendarQuery: PropTypes.func.isRequired,
    online: PropTypes.bool.isRequired,
    styles: PropTypes.objectOf(PropTypes.object).isRequired,
    threadPickerActive: PropTypes.bool.isRequired,
    dispatchActionPayload: PropTypes.func.isRequired,
    dispatchActionPromise: PropTypes.func.isRequired,
    createEntry: PropTypes.func.isRequired,
    saveEntry: PropTypes.func.isRequired,
    deleteEntry: PropTypes.func.isRequired,
  };
  textInput: ?React.ElementRef<typeof TextInput>;
  creating = false;
  needsUpdateAfterCreation = false;
  needsDeleteAfterCreation = false;
  nextSaveAttemptIndex = 0;
  mounted = false;
  deleted = false;
  currentlySaving: ?string;

  constructor(props: Props) {
    super(props);
    this.state = {
      editing: false,
      text: props.entryInfo.text,
      loadingStatus: 'inactive',
      height: props.entryInfo.textHeight,
    };
    this.state.editing = InternalEntry.isActive(props, this.state);
  }

  guardedSetState(input: $Shape<State>) {
    if (this.mounted) {
      this.setState(input);
    }
  }

  shouldComponentUpdate(nextProps: Props, nextState: State) {
    return (
      !shallowequal(nextState, this.state) ||
      !shallowequal(omitEntryInfo(nextProps), omitEntryInfo(this.props)) ||
      !_isEqual(nextProps.entryInfo)(this.props.entryInfo)
    );
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    const wasActive = InternalEntry.isActive(prevProps, prevState);
    const isActive = InternalEntry.isActive(this.props, this.state);

    if (
      !isActive &&
      (this.props.entryInfo.text !== prevProps.entryInfo.text ||
        this.props.entryInfo.textHeight !== prevProps.entryInfo.textHeight) &&
      (this.props.entryInfo.text !== this.state.text ||
        this.props.entryInfo.textHeight !== this.state.height)
    ) {
      this.guardedSetState({
        text: this.props.entryInfo.text,
        height: this.props.entryInfo.textHeight,
      });
      this.currentlySaving = null;
    }

    // Our parent will set the active prop to false if something else gets
    // pressed or if the Entry is scrolled out of view. In either of those cases
    // we should complete the edit process.
    if (!this.props.active && prevProps.active) {
      this.completeEdit();
    }

    if (this.state.height !== prevState.height || isActive !== wasActive) {
      LayoutAnimation.easeInEaseOut();
    }

    if (
      this.props.online &&
      !prevProps.online &&
      this.state.loadingStatus === 'error'
    ) {
      this.save();
    }

    if (
      this.state.editing &&
      prevState.editing &&
      (this.state.text.trim() === '') !== (prevState.text.trim() === '')
    ) {
      LayoutAnimation.easeInEaseOut();
    }
  }

  componentDidMount() {
    this.mounted = true;
    this.props.entryRef(entryKey(this.props.entryInfo), this);
  }

  componentWillUnmount() {
    this.mounted = false;
    this.props.entryRef(entryKey(this.props.entryInfo), null);
  }

  static isActive(props: Props, state: State) {
    return (
      props.active ||
      state.editing ||
      !props.entryInfo.id ||
      state.loadingStatus !== 'inactive'
    );
  }

  render() {
    const active = InternalEntry.isActive(this.props, this.state);
    const { editing } = this.state;
    const threadColor = `#${this.props.threadInfo.color}`;

    const darkColor = colorIsDark(this.props.threadInfo.color);
    let actionLinks = null;
    if (active) {
      const actionLinksColor = darkColor ? '#D3D3D3' : '#404040';
      const actionLinksTextStyle = { color: actionLinksColor };
      const { modalIosHighlightUnderlay: actionLinksUnderlayColor } = darkColor
        ? colors.dark
        : colors.light;
      const loadingIndicatorCanUseRed = hueDistance('red', threadColor) > 50;
      let editButtonContent = null;
      if (editing && this.state.text.trim() === '') {
        // nothing
      } else if (editing) {
        editButtonContent = (
          <React.Fragment>
            <Icon name="check" size={14} color={actionLinksColor} />
            <Text
              style={[this.props.styles.leftLinksText, actionLinksTextStyle]}
            >
              SAVE
            </Text>
          </React.Fragment>
        );
      } else {
        editButtonContent = (
          <React.Fragment>
            <Icon
              name="pencil"
              size={12}
              color={actionLinksColor}
              style={this.props.styles.pencilIcon}
            />
            <Text
              style={[this.props.styles.leftLinksText, actionLinksTextStyle]}
            >
              EDIT
            </Text>
          </React.Fragment>
        );
      }
      actionLinks = (
        <View style={this.props.styles.actionLinks}>
          <View style={this.props.styles.leftLinks}>
            <Button
              onPress={this.delete}
              iosFormat="highlight"
              iosHighlightUnderlayColor={actionLinksUnderlayColor}
              iosActiveOpacity={0.85}
              style={this.props.styles.button}
            >
              <View style={this.props.styles.buttonContents}>
                <Icon name="close" size={14} color={actionLinksColor} />
                <Text
                  style={[
                    this.props.styles.leftLinksText,
                    actionLinksTextStyle,
                  ]}
                >
                  DELETE
                </Text>
              </View>
            </Button>
            <Button
              onPress={this.onPressEdit}
              iosFormat="highlight"
              iosHighlightUnderlayColor={actionLinksUnderlayColor}
              iosActiveOpacity={0.85}
              style={this.props.styles.button}
            >
              <View style={this.props.styles.buttonContents}>
                {editButtonContent}
              </View>
            </Button>
          </View>
          <View style={this.props.styles.rightLinks}>
            <LoadingIndicator
              loadingStatus={this.state.loadingStatus}
              color={actionLinksColor}
              canUseRed={loadingIndicatorCanUseRed}
            />
            <Button
              onPress={this.onPressThreadName}
              iosFormat="highlight"
              iosHighlightUnderlayColor={actionLinksUnderlayColor}
              iosActiveOpacity={0.85}
              style={this.props.styles.button}
            >
              <Text
                style={[this.props.styles.rightLinksText, actionLinksTextStyle]}
                numberOfLines={1}
              >
                {this.props.threadInfo.uiName}
              </Text>
            </Button>
          </View>
        </View>
      );
    }

    const textColor = darkColor ? 'white' : 'black';
    let textInput;
    if (editing) {
      const textInputStyle = {
        color: textColor,
        backgroundColor: threadColor,
      };
      const selectionColor = darkColor ? '#129AFF' : '#036AFF';
      textInput = (
        <TextInput
          style={[this.props.styles.textInput, textInputStyle]}
          underlineColorAndroid="transparent"
          value={this.state.text}
          onChangeText={this.onChangeText}
          multiline={true}
          onFocus={this.onFocus}
          onBlur={this.onBlur}
          selectionColor={selectionColor}
          ref={this.textInputRef}
        />
      );
    }

    let rawText = this.state.text;
    if (rawText === '' || rawText.slice(-1) === '\n') {
      rawText += ' ';
    }
    const textStyle = {
      ...this.props.styles.text,
      color: textColor,
      opacity: textInput ? 0 : 1,
    };
    // We use an empty View to set the height of the entry, and then position
    // the Text and TextInput absolutely. This allows to measure height changes
    // to the Text while controlling the actual height of the entry.
    const heightStyle = { height: this.state.height };
    const entryStyle = { backgroundColor: threadColor };
    const opacity = editing ? 1.0 : 0.6;
    return (
      <TouchableWithoutFeedback onPress={this.props.onPressWhitespace}>
        <View style={this.props.styles.container}>
          <Button
            onPress={this.setActive}
            style={[this.props.styles.entry, entryStyle]}
            androidFormat="opacity"
            iosActiveOpacity={opacity}
          >
            <View>
              <View style={heightStyle} />
              <View
                style={this.props.styles.textContainer}
                onLayout={this.onTextContainerLayout}
              >
                <Markdown textStyle={textStyle} useDarkStyle={darkColor}>
                  {rawText}
                </Markdown>
              </View>
              {textInput}
            </View>
            {actionLinks}
          </Button>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  textInputRef = (textInput: ?React.ElementRef<typeof TextInput>) => {
    this.textInput = textInput;
    if (textInput && this.state.editing) {
      this.enterEditMode();
    }
  };

  enterEditMode = async () => {
    this.setActive();
    this.props.onEnterEditMode(this.props.entryInfo);
    if (Platform.OS === 'android') {
      // For some reason if we don't do this the scroll stops halfway through
      await waitForInteractions();
      await sleep(15);
    }
    this.focus();
  };

  focus = () => {
    const { textInput } = this;
    if (!textInput) {
      return;
    }
    textInput.focus();
  };

  onFocus = () => {
    if (this.props.threadPickerActive) {
      this.props.navigation.goBack();
    }
  };

  setActive = () => this.props.makeActive(entryKey(this.props.entryInfo), true);

  completeEdit = () => {
    // This gets called from CalendarInputBar (save button above keyboard),
    // onPressEdit (save button in Entry action links), and in
    // componentDidUpdate above when Calendar sets this Entry to inactive.
    // Calendar does this if something else gets pressed or the Entry is
    // scrolled out of view. Note that an Entry won't consider itself inactive
    // until it's done updating the server with its state, and if the network
    // requests fail it may stay "active".
    if (this.textInput) {
      this.textInput.blur();
    }
    this.onBlur();
  };

  onBlur = () => {
    if (this.state.text.trim() === '') {
      this.delete();
    } else if (this.props.entryInfo.text !== this.state.text) {
      this.save();
    }
    this.guardedSetState({ editing: false });
    this.props.makeActive(entryKey(this.props.entryInfo), false);
    this.props.onConcludeEditMode(this.props.entryInfo);
  };

  save = () => {
    this.dispatchSave(this.props.entryInfo.id, this.state.text);
  };

  onTextContainerLayout = (event: LayoutEvent) => {
    this.guardedSetState({
      height: Math.ceil(event.nativeEvent.layout.height),
    });
  };

  onChangeText = (newText: string) => {
    this.guardedSetState({ text: newText });
  };

  dispatchSave(serverID: ?string, newText: string) {
    if (this.currentlySaving === newText) {
      return;
    }
    this.currentlySaving = newText;

    if (newText.trim() === '') {
      // We don't save the empty string, since as soon as the element becomes
      // inactive it'll get deleted
      return;
    }

    if (!serverID) {
      if (this.creating) {
        // We need the first save call to return so we know the ID of the entry
        // we're updating, so we'll need to handle this save later
        this.needsUpdateAfterCreation = true;
        return;
      } else {
        this.creating = true;
      }
    }

    this.guardedSetState({ loadingStatus: 'loading' });
    if (!serverID) {
      this.props.dispatchActionPromise(
        createEntryActionTypes,
        this.createAction(newText),
      );
    } else {
      this.props.dispatchActionPromise(
        saveEntryActionTypes,
        this.saveAction(serverID, newText),
      );
    }
  }

  async createAction(text: string) {
    const localID = this.props.entryInfo.localID;
    invariant(localID, "if there's no serverID, there should be a localID");
    const curSaveAttempt = this.nextSaveAttemptIndex++;
    try {
      const response = await this.props.createEntry({
        text,
        timestamp: this.props.entryInfo.creationTime,
        date: dateString(
          this.props.entryInfo.year,
          this.props.entryInfo.month,
          this.props.entryInfo.day,
        ),
        threadID: this.props.entryInfo.threadID,
        localID,
        calendarQuery: this.props.calendarQuery(),
      });
      if (curSaveAttempt + 1 === this.nextSaveAttemptIndex) {
        this.guardedSetState({ loadingStatus: 'inactive' });
      }
      this.creating = false;
      if (this.needsUpdateAfterCreation) {
        this.needsUpdateAfterCreation = false;
        this.dispatchSave(response.entryID, this.state.text);
      }
      if (this.needsDeleteAfterCreation) {
        this.needsDeleteAfterCreation = false;
        this.dispatchDelete(response.entryID);
      }
      return response;
    } catch (e) {
      if (curSaveAttempt + 1 === this.nextSaveAttemptIndex) {
        this.guardedSetState({ loadingStatus: 'error' });
      }
      this.currentlySaving = null;
      this.creating = false;
      throw e;
    }
  }

  async saveAction(entryID: string, newText: string) {
    const curSaveAttempt = this.nextSaveAttemptIndex++;
    try {
      const response = await this.props.saveEntry({
        entryID,
        text: newText,
        prevText: this.props.entryInfo.text,
        timestamp: Date.now(),
        calendarQuery: this.props.calendarQuery(),
      });
      if (curSaveAttempt + 1 === this.nextSaveAttemptIndex) {
        this.guardedSetState({ loadingStatus: 'inactive' });
      }
      return { ...response, threadID: this.props.entryInfo.threadID };
    } catch (e) {
      if (curSaveAttempt + 1 === this.nextSaveAttemptIndex) {
        this.guardedSetState({ loadingStatus: 'error' });
      }
      this.currentlySaving = null;
      if (e instanceof ServerError && e.message === 'concurrent_modification') {
        const revertedText = e.payload.db;
        const onRefresh = () => {
          this.guardedSetState({
            loadingStatus: 'inactive',
            text: revertedText,
          });
          this.props.dispatchActionPayload(
            concurrentModificationResetActionType,
            { id: entryID, dbText: revertedText },
          );
        };
        Alert.alert(
          'Concurrent modification',
          'It looks like somebody is attempting to modify that field at the ' +
            'same time as you! Please try again.',
          [{ text: 'OK', onPress: onRefresh }],
          { cancelable: false },
        );
      }
      throw e;
    }
  }

  delete = () => {
    this.dispatchDelete(this.props.entryInfo.id);
  };

  onPressEdit = () => {
    if (this.state.editing) {
      this.completeEdit();
    } else {
      this.guardedSetState({ editing: true });
    }
  };

  dispatchDelete(serverID: ?string) {
    if (this.deleted) {
      return;
    }
    this.deleted = true;
    LayoutAnimation.easeInEaseOut();
    const { localID } = this.props.entryInfo;
    this.props.dispatchActionPromise(
      deleteEntryActionTypes,
      this.deleteAction(serverID),
      undefined,
      { localID, serverID },
    );
  }

  async deleteAction(serverID: ?string) {
    if (serverID) {
      return await this.props.deleteEntry({
        entryID: serverID,
        prevText: this.props.entryInfo.text,
        calendarQuery: this.props.calendarQuery(),
      });
    } else if (this.creating) {
      this.needsDeleteAfterCreation = true;
    }
    return null;
  }

  onPressThreadName = () => {
    Keyboard.dismiss();
    const { threadInfo } = this.props;
    this.props.navigation.navigate({
      name: MessageListRouteName,
      params: { threadInfo },
      key: `${MessageListRouteName}${threadInfo.id}`,
    });
  };
}

const textStyle = {
  fontFamily: 'System',
  fontSize: 16,
};
const textPadding = {
  paddingBottom: 6,
  paddingLeft: 10,
  paddingRight: 10,
  paddingTop: 5,
};
const entryStyle = {
  borderRadius: 8,
  margin: 5,
  overflow: 'hidden',
};

const styles = {
  actionLinks: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -5,
  },
  button: {
    padding: 5,
  },
  buttonContents: {
    flex: 1,
    flexDirection: 'row',
  },
  container: {
    backgroundColor: 'listBackground',
  },
  entry: entryStyle,
  leftLinks: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 5,
  },
  leftLinksText: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingLeft: 5,
  },
  pencilIcon: {
    lineHeight: 13,
    paddingTop: 1,
  },
  rightLinks: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 5,
  },
  rightLinksText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  text: textStyle,
  textContainer: {
    position: 'absolute',
    top: 0,
    ...textPadding,
  },
  textMeasurement: {
    ...textPadding,
    ...textStyle,
    ...entryStyle,
  },
  textInput: {
    fontFamily: 'System',
    fontSize: 16,
    left: Platform.OS === 'android' ? 9.8 : 10,
    margin: 0,
    padding: 0,
    position: 'absolute',
    right: 10,
    top: Platform.OS === 'android' ? 4.8 : 0.5,
  },
};
const stylesSelector = styleSelector(styles);

registerFetchKey(saveEntryActionTypes);
registerFetchKey(deleteEntryActionTypes);
const activeThreadPickerSelector = createIsForegroundSelector(
  ThreadPickerModalRouteName,
);

const Entry = connectNav((context: ?NavContextType) => ({
  navContext: context,
  threadPickerActive: activeThreadPickerSelector(context),
}))(
  connect(
    (state: AppState, ownProps: { navContext: ?NavContextType }) => ({
      calendarQuery: nonThreadCalendarQuery({
        redux: state,
        navContext: ownProps.navContext,
      }),
      online: state.connection.status === 'connected',
      styles: stylesSelector(state),
    }),
    { createEntry, saveEntry, deleteEntry },
  )(InternalEntry),
);

export { InternalEntry, Entry, styles as entryStyles };
