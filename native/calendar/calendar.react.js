// @flow

import {
  type EntryInfo,
  entryInfoPropType,
  type CalendarQuery,
  type CalendarQueryUpdateResult,
} from 'lib/types/entry-types';
import type { AppState } from '../redux/redux-setup';
import type {
  CalendarItem,
  SectionHeaderItem,
  SectionFooterItem,
  LoaderItem,
} from '../selectors/calendar-selectors';
import type { ViewToken } from '../types/react-native';
import type { DispatchActionPromise } from 'lib/utils/action-utils';
import type { KeyboardEvent } from '../keyboard/keyboard';
import type { NodeToMeasure } from '../components/node-height-measurer.react';
import {
  type CalendarFilter,
  calendarFilterPropType,
} from 'lib/types/filter-types';
import {
  type DimensionsInfo,
  dimensionsInfoPropType,
} from '../redux/dimensions-updater.react';
import {
  type LoadingStatus,
  loadingStatusPropType,
} from 'lib/types/loading-types';
import {
  type ConnectionStatus,
  connectionStatusPropType,
} from 'lib/types/socket-types';
import { type ThreadInfo, threadInfoPropType } from 'lib/types/thread-types';
import type { TabNavigationProp } from '../navigation/app-navigator.react';
import type { NavigationRoute } from '../navigation/route-names';

import * as React from 'react';
import {
  View,
  Text,
  FlatList,
  AppState as NativeAppState,
  Platform,
  LayoutAnimation,
  TouchableWithoutFeedback,
} from 'react-native';
import PropTypes from 'prop-types';
import invariant from 'invariant';
import _findIndex from 'lodash/fp/findIndex';
import _isEqual from 'lodash/fp/isEqual';
import _map from 'lodash/fp/map';
import _find from 'lodash/fp/find';
import _differenceWith from 'lodash/fp/differenceWith';
import _filter from 'lodash/fp/filter';
import _sum from 'lodash/fp/sum';
import _pickBy from 'lodash/fp/pickBy';
import _size from 'lodash/fp/size';
import _throttle from 'lodash/throttle';
import { SafeAreaView } from 'react-native-safe-area-context';

import { entryKey } from 'lib/shared/entry-utils';
import { dateString, prettyDate, dateFromString } from 'lib/utils/date-utils';
import {
  updateCalendarQueryActionTypes,
  updateCalendarQuery,
} from 'lib/actions/entry-actions';
import { connect } from 'lib/utils/redux-utils';
import { createLoadingStatusSelector } from 'lib/selectors/loading-selectors';

import { Entry, InternalEntry, combinedEntryStyle } from './entry.react';
import { calendarListData } from '../selectors/calendar-selectors';
import {
  createIsForegroundSelector,
  createActiveTabSelector,
} from '../navigation/nav-selectors';
import NodeHeightMeasurer from '../components/node-height-measurer.react';
import ListLoadingIndicator from '../components/list-loading-indicator.react';
import SectionFooter from './section-footer.react';
import CalendarInputBar from './calendar-input-bar.react';
import {
  addKeyboardShowListener,
  addKeyboardDismissListener,
  removeKeyboardListener,
} from '../keyboard/keyboard';
import {
  CalendarRouteName,
  ThreadPickerModalRouteName,
} from '../navigation/route-names';
import DisconnectedBar from '../navigation/disconnected-bar.react';
import {
  type Colors,
  colorsPropType,
  colorsSelector,
  styleSelector,
} from '../themes/colors';
import ContentLoading from '../components/content-loading.react';
import {
  connectNav,
  type NavContextType,
} from '../navigation/navigation-context';
import KeyboardAvoidingView from '../components/keyboard-avoiding-view.react';

export type EntryInfoWithHeight = {|
  ...EntryInfo,
  textHeight: number,
|};
type CalendarItemWithHeight =
  | LoaderItem
  | SectionHeaderItem
  | SectionFooterItem
  | {|
      itemType: 'entryInfo',
      entryInfo: EntryInfoWithHeight,
      threadInfo: ThreadInfo,
    |};
type ExtraData = $ReadOnly<{|
  activeEntries: { [key: string]: boolean },
  visibleEntries: { [key: string]: boolean },
|}>;

const safeAreaEdges = ['top'];

type Props = {
  navigation: TabNavigationProp<'Calendar'>,
  route: NavigationRoute<'Calendar'>,
  // Redux state
  listData: ?$ReadOnlyArray<CalendarItem>,
  calendarActive: boolean,
  startDate: string,
  endDate: string,
  calendarFilters: $ReadOnlyArray<CalendarFilter>,
  dimensions: DimensionsInfo,
  loadingStatus: LoadingStatus,
  connectionStatus: ConnectionStatus,
  colors: Colors,
  styles: typeof styles,
  // Redux dispatch functions
  dispatchActionPromise: DispatchActionPromise,
  // async functions that hit server APIs
  updateCalendarQuery: (
    calendarQuery: CalendarQuery,
    reduxAlreadyUpdated?: boolean,
  ) => Promise<CalendarQueryUpdateResult>,
};
type State = {|
  nodesToMeasure: NodeToMeasure[],
  listDataWithHeights: ?$ReadOnlyArray<CalendarItemWithHeight>,
  readyToShowList: boolean,
  extraData: ExtraData,
  currentlyEditing: $ReadOnlyArray<string>,
|};
class Calendar extends React.PureComponent<Props, State> {
  static propTypes = {
    navigation: PropTypes.shape({
      navigate: PropTypes.func.isRequired,
      addListener: PropTypes.func.isRequired,
      removeListener: PropTypes.func.isRequired,
      isFocused: PropTypes.func.isRequired,
    }).isRequired,
    route: PropTypes.shape({
      key: PropTypes.string.isRequired,
    }).isRequired,
    listData: PropTypes.arrayOf(
      PropTypes.oneOfType([
        PropTypes.shape({
          itemType: PropTypes.oneOf(['loader']),
          key: PropTypes.string.isRequired,
        }),
        PropTypes.shape({
          itemType: PropTypes.oneOf(['header']),
          dateString: PropTypes.string.isRequired,
        }),
        PropTypes.shape({
          itemType: PropTypes.oneOf(['entryInfo']),
          entryInfo: entryInfoPropType.isRequired,
          threadInfo: threadInfoPropType.isRequired,
        }),
        PropTypes.shape({
          itemType: PropTypes.oneOf(['footer']),
          dateString: PropTypes.string.isRequired,
        }),
      ]),
    ),
    calendarActive: PropTypes.bool.isRequired,
    startDate: PropTypes.string.isRequired,
    endDate: PropTypes.string.isRequired,
    calendarFilters: PropTypes.arrayOf(calendarFilterPropType).isRequired,
    dimensions: dimensionsInfoPropType.isRequired,
    loadingStatus: loadingStatusPropType.isRequired,
    connectionStatus: connectionStatusPropType.isRequired,
    colors: colorsPropType.isRequired,
    styles: PropTypes.objectOf(PropTypes.object).isRequired,
    dispatchActionPromise: PropTypes.func.isRequired,
    updateCalendarQuery: PropTypes.func.isRequired,
  };
  flatList: ?FlatList<CalendarItemWithHeight> = null;
  nodeHeights: ?Map<string, number> = null;
  currentState: ?string = NativeAppState.currentState;
  lastForegrounded = 0;
  lastCalendarReset = 0;
  currentScrollPosition: ?number = null;
  // We don't always want an extraData update to trigger a state update, so we
  // cache the most recent value as a member here
  latestExtraData: ExtraData;
  // For some reason, we have to delay the scrollToToday call after the first
  // scroll upwards on Android. I don't know why. Might only be on the emulator.
  firstScrollUpOnAndroidComplete = false;
  // When an entry becomes active, we make a note of its key so that once the
  // keyboard event happens, we know where to move the scrollPos to
  lastEntryKeyActive: ?string = null;
  keyboardShowListener: ?{ +remove: () => void };
  keyboardDismissListener: ?{ +remove: () => void };
  keyboardShownHeight: ?number = null;
  // If the query fails, we try it again
  topLoadingFromScroll: ?CalendarQuery = null;
  bottomLoadingFromScroll: ?CalendarQuery = null;
  // We wait until the loaders leave view before letting them be triggered again
  topLoaderWaitingToLeaveView = true;
  bottomLoaderWaitingToLeaveView = true;
  // We keep refs to the entries so CalendarInputBar can save them
  entryRefs = new Map();

  constructor(props: Props) {
    super(props);
    const nodesToMeasure = props.listData
      ? Calendar.nodesToMeasureFromListData(props.listData)
      : [];
    this.latestExtraData = {
      activeEntries: {},
      visibleEntries: {},
    };
    this.state = {
      nodesToMeasure,
      listDataWithHeights: null,
      readyToShowList: false,
      extraData: this.latestExtraData,
      currentlyEditing: [],
    };
  }

  static nodesToMeasureFromListData(listData: $ReadOnlyArray<CalendarItem>) {
    const nodesToMeasure = [];
    for (let item of listData) {
      if (item.itemType !== 'entryInfo') {
        continue;
      }
      const text = item.entryInfo.text === '' ? ' ' : item.entryInfo.text;
      const node = <Text style={combinedEntryStyle}>{text}</Text>;
      nodesToMeasure.push({
        id: entryKey(item.entryInfo),
        node,
      });
    }
    return nodesToMeasure;
  }

  componentDidMount() {
    NativeAppState.addEventListener('change', this.handleAppStateChange);
    this.keyboardShowListener = addKeyboardShowListener(this.keyboardShow);
    this.keyboardDismissListener = addKeyboardDismissListener(
      this.keyboardDismiss,
    );
    this.props.navigation.addListener('tabPress', this.onTabPress);
  }

  componentWillUnmount() {
    NativeAppState.removeEventListener('change', this.handleAppStateChange);
    if (this.keyboardShowListener) {
      removeKeyboardListener(this.keyboardShowListener);
      this.keyboardShowListener = null;
    }
    if (this.keyboardDismissListener) {
      removeKeyboardListener(this.keyboardDismissListener);
      this.keyboardDismissListener = null;
    }
    this.props.navigation.removeListener('tabPress', this.onTabPress);
  }

  handleAppStateChange = (nextAppState: ?string) => {
    const lastState = this.currentState;
    this.currentState = nextAppState;
    if (
      !lastState ||
      !lastState.match(/inactive|background/) ||
      this.currentState !== 'active'
    ) {
      // We're only handling foregrounding here
      return;
    }
    if (Date.now() - this.lastCalendarReset < 500) {
      // If the calendar got reset right before this callback triggered, that
      // indicates we should reset the scroll position
      this.lastCalendarReset = 0;
      this.scrollToToday(false);
    } else {
      // Otherwise, it's possible that the calendar is about to get reset. We
      // record a timestamp here so we can scrollToToday there.
      this.lastForegrounded = Date.now();
    }
  };

  onTabPress = () => {
    if (this.props.navigation.isFocused()) {
      this.scrollToToday();
    }
  };

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (this.props.listData !== prevProps.listData) {
      this.handleNewNodesToMeasure();
    }

    const { loadingStatus, connectionStatus } = this.props;
    const {
      loadingStatus: prevLoadingStatus,
      connectionStatus: prevConnectionStatus,
    } = prevProps;
    if (
      (loadingStatus === 'error' && prevLoadingStatus === 'loading') ||
      (connectionStatus === 'connected' && prevConnectionStatus !== 'connected')
    ) {
      this.loadMoreAbove();
      this.loadMoreBelow();
    }

    const lastLDWH = prevState.listDataWithHeights;
    const newLDWH = this.state.listDataWithHeights;
    if (!lastLDWH || !newLDWH) {
      return;
    }

    if (newLDWH.length < lastLDWH.length && this.flatList) {
      if (!this.props.calendarActive) {
        // If the currentCalendarQuery gets reset we scroll to the center
        this.scrollToToday();
      } else if (Date.now() - this.lastForegrounded < 500) {
        // If the app got foregrounded right before the calendar got reset, that
        // indicates we should reset the scroll position
        this.lastForegrounded = 0;
        this.scrollToToday(false);
      } else {
        // Otherwise, it's possible that the foreground callback is about to get
        // triggered. We record a timestamp here so we can scrollToToday there.
        this.lastCalendarReset = Date.now();
      }
    }

    const {
      lastStartDate,
      newStartDate,
      lastEndDate,
      newEndDate,
    } = Calendar.datesFromListData(lastLDWH, newLDWH);

    if (newStartDate > lastStartDate || newEndDate < lastEndDate) {
      // If there are fewer items in our new data, which happens when the
      // current calendar query gets reset due to inactivity, let's reset the
      // scroll position to the center (today)
      if (!this.props.calendarActive) {
        setTimeout(() => this.scrollToToday(), 50);
      }
      this.firstScrollUpOnAndroidComplete = false;
    } else if (newStartDate < lastStartDate) {
      this.updateScrollPositionAfterPrepend(lastLDWH, newLDWH);
    } else if (newEndDate > lastEndDate) {
      this.firstScrollUpOnAndroidComplete = true;
    } else if (newLDWH.length > lastLDWH.length) {
      LayoutAnimation.easeInEaseOut();
    }

    if (newStartDate < lastStartDate) {
      this.topLoadingFromScroll = null;
    }
    if (newEndDate > lastEndDate) {
      this.bottomLoadingFromScroll = null;
    }

    const { keyboardShownHeight, lastEntryKeyActive } = this;
    if (keyboardShownHeight && lastEntryKeyActive) {
      this.scrollToKey(lastEntryKeyActive, keyboardShownHeight);
      this.lastEntryKeyActive = null;
    }
  }

  handleNewNodesToMeasure() {
    const { listData } = this.props;
    if (!listData) {
      this.latestExtraData = {
        activeEntries: {},
        visibleEntries: {},
      };
      this.setState({
        nodesToMeasure: [],
        listDataWithHeights: null,
        readyToShowList: false,
        extraData: this.latestExtraData,
      });
      this.topLoaderWaitingToLeaveView = true;
      this.bottomLoaderWaitingToLeaveView = true;
      return;
    }

    const newNodesToMeasure = Calendar.nodesToMeasureFromListData(listData);
    const newNodes = _differenceWith(_isEqual)(newNodesToMeasure)(
      this.state.nodesToMeasure,
    );
    if (newNodes.length !== 0) {
      // We set nodeHeights to null here since if a future set of nodes
      // came in before we completed height measurement that was a subset
      // of the earlier nodes, we would end up merging directly there, but
      // then when the measurement for the middle nodes came in it would
      // override the newer node heights.
      this.nodeHeights = null;
      this.setState({ nodesToMeasure: newNodesToMeasure });
      return;
    }

    let allNodesAlreadyMeasured = false;
    if (this.nodeHeights) {
      allNodesAlreadyMeasured = true;
      for (let nodeToMeasure of newNodesToMeasure) {
        if (!this.nodeHeights.has(nodeToMeasure.id)) {
          allNodesAlreadyMeasured = false;
          break;
        }
      }
    }
    if (allNodesAlreadyMeasured) {
      this.mergeHeightsIntoListData();
    }

    // If we don't have everything in nodeHeights, but we do have everything in
    // nodesToMeasure, we can conclude that we're just waiting for the
    // measurement to complete and then we'll be good.
  }

  static datesFromListData(
    lastLDWH: $ReadOnlyArray<CalendarItemWithHeight>,
    newLDWH: $ReadOnlyArray<CalendarItemWithHeight>,
  ) {
    const lastSecondItem = lastLDWH[1];
    const newSecondItem = newLDWH[1];
    invariant(
      newSecondItem.itemType === 'header' &&
        lastSecondItem.itemType === 'header',
      'second item in listData should be a header',
    );
    const lastStartDate = dateFromString(lastSecondItem.dateString);
    const newStartDate = dateFromString(newSecondItem.dateString);

    const lastPenultimateItem = lastLDWH[lastLDWH.length - 2];
    const newPenultimateItem = newLDWH[newLDWH.length - 2];
    invariant(
      newPenultimateItem.itemType === 'footer' &&
        lastPenultimateItem.itemType === 'footer',
      'penultimate item in listData should be a footer',
    );
    const lastEndDate = dateFromString(lastPenultimateItem.dateString);
    const newEndDate = dateFromString(newPenultimateItem.dateString);

    return { lastStartDate, newStartDate, lastEndDate, newEndDate };
  }

  /**
   * When prepending list items, FlatList isn't smart about preserving scroll
   * position. If we're at the start of the list before prepending, FlatList
   * will just keep us at the front after prepending. But we want to preserve
   * the previous on-screen items, so we have to do a calculation to get the new
   * scroll position. (And deal with the inherent glitchiness of trying to time
   * that change with the items getting prepended... *sigh*.)
   */
  updateScrollPositionAfterPrepend(
    lastLDWH: $ReadOnlyArray<CalendarItemWithHeight>,
    newLDWH: $ReadOnlyArray<CalendarItemWithHeight>,
  ) {
    const existingKeys = new Set(_map(Calendar.keyExtractor)(lastLDWH));
    const newItems = _filter(
      (item: CalendarItemWithHeight) =>
        !existingKeys.has(Calendar.keyExtractor(item)),
    )(newLDWH);
    const heightOfNewItems = Calendar.heightOfItems(newItems);
    const flatList = this.flatList;
    invariant(flatList, 'flatList should be set');
    const scrollAction = () => {
      invariant(
        this.currentScrollPosition !== undefined &&
          this.currentScrollPosition !== null,
        'currentScrollPosition should be set',
      );
      const currentScrollPosition = Math.max(this.currentScrollPosition, 0);
      let offset = currentScrollPosition + heightOfNewItems;
      flatList.scrollToOffset({
        offset,
        animated: false,
      });
    };
    if (Platform.OS === 'android' && !this.firstScrollUpOnAndroidComplete) {
      setTimeout(scrollAction, 0);
      this.firstScrollUpOnAndroidComplete = true;
    } else {
      scrollAction();
    }
  }

  static entryInfoWithHeight(
    entryInfo: EntryInfo,
    textHeight: number,
  ): EntryInfoWithHeight {
    // Blame Flow for not accepting object spread on exact types
    if (entryInfo.id && entryInfo.localID) {
      return {
        id: entryInfo.id,
        localID: entryInfo.localID,
        threadID: entryInfo.threadID,
        text: entryInfo.text,
        year: entryInfo.year,
        month: entryInfo.month,
        day: entryInfo.day,
        creationTime: entryInfo.creationTime,
        creator: entryInfo.creator,
        deleted: entryInfo.deleted,
        textHeight: Math.ceil(textHeight),
      };
    } else if (entryInfo.id) {
      return {
        id: entryInfo.id,
        threadID: entryInfo.threadID,
        text: entryInfo.text,
        year: entryInfo.year,
        month: entryInfo.month,
        day: entryInfo.day,
        creationTime: entryInfo.creationTime,
        creator: entryInfo.creator,
        deleted: entryInfo.deleted,
        textHeight: Math.ceil(textHeight),
      };
    } else {
      return {
        localID: entryInfo.localID,
        threadID: entryInfo.threadID,
        text: entryInfo.text,
        year: entryInfo.year,
        month: entryInfo.month,
        day: entryInfo.day,
        creationTime: entryInfo.creationTime,
        creator: entryInfo.creator,
        deleted: entryInfo.deleted,
        textHeight: Math.ceil(textHeight),
      };
    }
  }

  mergeHeightsIntoListData() {
    const { listData } = this.props;
    if (!listData) {
      return;
    }

    const { nodeHeights } = this;
    invariant(nodeHeights, 'nodeHeights should be set');
    const listDataWithHeights = _map((item: CalendarItem) => {
      if (item.itemType !== 'entryInfo') {
        return item;
      }
      const entryInfo = item.entryInfo;
      const textHeight = nodeHeights.get(entryKey(entryInfo));
      invariant(textHeight, `height for ${entryKey(entryInfo)} should be set`);
      return {
        itemType: 'entryInfo',
        entryInfo: Calendar.entryInfoWithHeight(item.entryInfo, textHeight),
        threadInfo: item.threadInfo,
      };
    })(listData);
    if (
      // At the start, we need to set LoaderWaitingToLeaveView since we don't
      // want the loaders to trigger when nothing is there
      !this.state.listDataWithHeights ||
      // We know that this is going to shrink our FlatList. When our FlatList
      // shrinks, componentDidUpdate will trigger scrollToToday
      listDataWithHeights.length < this.state.listDataWithHeights.length
    ) {
      this.topLoaderWaitingToLeaveView = true;
      this.bottomLoaderWaitingToLeaveView = true;
    }
    this.setState({ listDataWithHeights });
  }

  scrollToToday(animated: ?boolean = undefined) {
    if (animated === undefined) {
      animated = this.props.calendarActive;
    }
    const ldwh = this.state.listDataWithHeights;
    if (!ldwh) {
      return;
    }
    const todayIndex = _findIndex(['dateString', dateString(new Date())])(ldwh);
    invariant(this.flatList, "scrollToToday called, but flatList isn't set");
    this.flatList.scrollToIndex({
      index: todayIndex,
      animated,
      viewPosition: 0.5,
    });
  }

  renderItem = (row: { item: CalendarItemWithHeight }) => {
    const item = row.item;
    if (item.itemType === 'loader') {
      return <ListLoadingIndicator />;
    } else if (item.itemType === 'header') {
      return this.renderSectionHeader(item);
    } else if (item.itemType === 'entryInfo') {
      const key = entryKey(item.entryInfo);
      return (
        <Entry
          navigation={this.props.navigation}
          entryInfo={item.entryInfo}
          threadInfo={item.threadInfo}
          active={!!this.state.extraData.activeEntries[key]}
          visible={!!this.state.extraData.visibleEntries[key]}
          makeActive={this.makeActive}
          onEnterEditMode={this.onEnterEntryEditMode}
          onConcludeEditMode={this.onConcludeEntryEditMode}
          onPressWhitespace={this.makeAllEntriesInactive}
          entryRef={this.entryRef}
        />
      );
    } else if (item.itemType === 'footer') {
      return this.renderSectionFooter(item);
    }
    invariant(false, 'renderItem conditions should be exhaustive');
  };

  renderSectionHeader = (item: SectionHeaderItem) => {
    let date = prettyDate(item.dateString);
    if (dateString(new Date()) === item.dateString) {
      date += ' (today)';
    }
    const dateObj = dateFromString(item.dateString).getDay();
    const weekendStyle =
      dateObj === 0 || dateObj === 6
        ? this.props.styles.weekendSectionHeader
        : null;
    return (
      <TouchableWithoutFeedback onPress={this.makeAllEntriesInactive}>
        <View style={[this.props.styles.sectionHeader, weekendStyle]}>
          <Text style={this.props.styles.sectionHeaderText}>{date}</Text>
        </View>
      </TouchableWithoutFeedback>
    );
  };

  renderSectionFooter = (item: SectionFooterItem) => {
    return (
      <SectionFooter
        dateString={item.dateString}
        onAdd={this.onAdd}
        onPressWhitespace={this.makeAllEntriesInactive}
      />
    );
  };

  onAdd = (dayString: string) => {
    this.props.navigation.navigate(ThreadPickerModalRouteName, {
      presentedFrom: this.props.route.key,
      dateString: dayString,
    });
  };

  static keyExtractor = (item: CalendarItemWithHeight) => {
    if (item.itemType === 'loader') {
      return item.key;
    } else if (item.itemType === 'header') {
      return item.dateString + '/header';
    } else if (item.itemType === 'entryInfo') {
      return entryKey(item.entryInfo);
    } else if (item.itemType === 'footer') {
      return item.dateString + '/footer';
    }
    invariant(false, 'keyExtractor conditions should be exhaustive');
  };

  static getItemLayout(
    data: ?$ReadOnlyArray<CalendarItemWithHeight>,
    index: number,
  ) {
    if (!data) {
      return { length: 0, offset: 0, index };
    }
    const offset = Calendar.heightOfItems(data.filter((_, i) => i < index));
    const item = data[index];
    const length = item ? Calendar.itemHeight(item) : 0;
    return { length, offset, index };
  }

  static itemHeight(item: CalendarItemWithHeight): number {
    if (item.itemType === 'loader') {
      return 56;
    } else if (item.itemType === 'header') {
      return 31;
    } else if (item.itemType === 'entryInfo') {
      const verticalPadding = 10;
      return verticalPadding + item.entryInfo.textHeight;
    } else if (item.itemType === 'footer') {
      return 40;
    }
    invariant(false, 'itemHeight conditions should be exhaustive');
  }

  static heightOfItems(data: $ReadOnlyArray<CalendarItemWithHeight>): number {
    return _sum(data.map(Calendar.itemHeight));
  }

  render() {
    const listDataWithHeights = this.state.listDataWithHeights;
    let flatList = null;
    if (listDataWithHeights) {
      const flatListStyle = { opacity: this.state.readyToShowList ? 1 : 0 };
      const initialScrollIndex = this.initialScrollIndex(listDataWithHeights);
      flatList = (
        <FlatList
          data={listDataWithHeights}
          renderItem={this.renderItem}
          keyExtractor={Calendar.keyExtractor}
          getItemLayout={Calendar.getItemLayout}
          onViewableItemsChanged={this.onViewableItemsChanged}
          onScroll={this.onScroll}
          initialScrollIndex={initialScrollIndex}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onMomentumScrollEnd={this.onMomentumScrollEnd}
          onScrollEndDrag={this.onScrollEndDrag}
          scrollsToTop={false}
          extraData={this.state.extraData}
          style={[this.props.styles.flatList, flatListStyle]}
          ref={this.flatListRef}
        />
      );
    }
    let loadingIndicator = null;
    if (!listDataWithHeights || !this.state.readyToShowList) {
      loadingIndicator = (
        <ContentLoading fillType="absolute" colors={this.props.colors} />
      );
    }
    const disableInputBar = this.state.currentlyEditing.length === 0;
    return (
      <>
        <NodeHeightMeasurer
          nodesToMeasure={this.state.nodesToMeasure}
          allHeightsMeasuredCallback={this.allHeightsMeasured}
        />
        <SafeAreaView style={this.props.styles.container} edges={safeAreaEdges}>
          <DisconnectedBar visible={this.props.calendarActive} />
          {loadingIndicator}
          {flatList}
        </SafeAreaView>
        <KeyboardAvoidingView
          behavior="position"
          style={this.props.styles.keyboardAvoidingViewContainer}
          contentContainerStyle={this.props.styles.keyboardAvoidingView}
          pointerEvents="box-none"
        >
          <CalendarInputBar
            onSave={this.onSaveEntry}
            disabled={disableInputBar}
          />
        </KeyboardAvoidingView>
      </>
    );
  }

  flatListHeight() {
    const {
      height: windowHeight,
      topInset,
      bottomInset,
      tabBarHeight,
    } = this.props.dimensions;
    return windowHeight - topInset - bottomInset - tabBarHeight;
  }

  initialScrollIndex(data: $ReadOnlyArray<CalendarItemWithHeight>) {
    const todayIndex = _findIndex(['dateString', dateString(new Date())])(data);
    const heightOfTodayHeader = Calendar.itemHeight(data[todayIndex]);

    let returnIndex = todayIndex;
    let heightLeft = (this.flatListHeight() - heightOfTodayHeader) / 2;
    while (heightLeft > 0) {
      heightLeft -= Calendar.itemHeight(data[--returnIndex]);
    }
    return returnIndex;
  }

  flatListRef = (flatList: ?FlatList<CalendarItemWithHeight>) => {
    this.flatList = flatList;
  };

  entryRef = (inEntryKey: string, entry: ?InternalEntry) => {
    this.entryRefs.set(inEntryKey, entry);
  };

  makeAllEntriesInactive = () => {
    if (_size(this.state.extraData.activeEntries) === 0) {
      if (_size(this.latestExtraData.activeEntries) !== 0) {
        this.latestExtraData = {
          visibleEntries: this.latestExtraData.visibleEntries,
          activeEntries: this.state.extraData.activeEntries,
        };
      }
      return;
    }
    this.latestExtraData = {
      visibleEntries: this.latestExtraData.visibleEntries,
      activeEntries: {},
    };
    this.setState({ extraData: this.latestExtraData });
  };

  makeActive = (key: string, active: boolean) => {
    if (!active) {
      const activeKeys = Object.keys(this.latestExtraData.activeEntries);
      if (activeKeys.length === 0) {
        if (Object.keys(this.state.extraData.activeEntries).length !== 0) {
          this.setState({ extraData: this.latestExtraData });
        }
        return;
      }
      const activeKey = activeKeys[0];
      if (activeKey === key) {
        this.latestExtraData = {
          visibleEntries: this.latestExtraData.visibleEntries,
          activeEntries: {},
        };
        this.setState({ extraData: this.latestExtraData });
      }
      return;
    }

    if (
      _size(this.state.extraData.activeEntries) === 1 &&
      this.state.extraData.activeEntries[key]
    ) {
      if (
        _size(this.latestExtraData.activeEntries) !== 1 ||
        !this.latestExtraData.activeEntries[key]
      ) {
        this.latestExtraData = {
          visibleEntries: this.latestExtraData.visibleEntries,
          activeEntries: this.state.extraData.activeEntries,
        };
      }
      return;
    }
    this.latestExtraData = {
      visibleEntries: this.latestExtraData.visibleEntries,
      activeEntries: { [key]: true },
    };
    this.setState({ extraData: this.latestExtraData });
  };

  onEnterEntryEditMode = (entryInfo: EntryInfoWithHeight) => {
    const key = entryKey(entryInfo);
    const keyboardShownHeight = this.keyboardShownHeight;
    if (keyboardShownHeight && this.state.listDataWithHeights) {
      this.scrollToKey(key, keyboardShownHeight);
    } else {
      this.lastEntryKeyActive = key;
    }
    const newCurrentlyEditing = [
      ...new Set([...this.state.currentlyEditing, key]),
    ];
    if (newCurrentlyEditing.length > this.state.currentlyEditing.length) {
      this.setState({ currentlyEditing: newCurrentlyEditing });
    }
  };

  onConcludeEntryEditMode = (entryInfo: EntryInfoWithHeight) => {
    const key = entryKey(entryInfo);
    const newCurrentlyEditing = this.state.currentlyEditing.filter(
      k => k !== key,
    );
    if (newCurrentlyEditing.length < this.state.currentlyEditing.length) {
      this.setState({ currentlyEditing: newCurrentlyEditing });
    }
  };

  keyboardShow = (event: KeyboardEvent) => {
    // flatListHeight() factors in the size of the tab bar,
    // but it is hidden by the keyboard since it is at the bottom
    const { bottomInset, tabBarHeight } = this.props.dimensions;
    const inputBarHeight = Platform.OS === 'android' ? 37.7 : 35.5;
    const keyboardHeight = Platform.select({
      // Android doesn't include the bottomInset in this height measurement
      android: event.endCoordinates.height,
      default: Math.max(event.endCoordinates.height - bottomInset, 0),
    });
    const keyboardShownHeight =
      inputBarHeight + Math.max(keyboardHeight - tabBarHeight, 0);
    this.keyboardShownHeight = keyboardShownHeight;

    const lastEntryKeyActive = this.lastEntryKeyActive;
    if (lastEntryKeyActive && this.state.listDataWithHeights) {
      this.scrollToKey(lastEntryKeyActive, keyboardShownHeight);
      this.lastEntryKeyActive = null;
    }
  };

  keyboardDismiss = () => {
    this.keyboardShownHeight = null;
  };

  scrollToKey(lastEntryKeyActive: string, keyboardHeight: number) {
    const data = this.state.listDataWithHeights;
    invariant(data, 'should be set');
    const index = _findIndex(
      (item: CalendarItemWithHeight) =>
        Calendar.keyExtractor(item) === lastEntryKeyActive,
    )(data);
    if (index === null || index === undefined) {
      return;
    }
    const itemStart = Calendar.heightOfItems(data.filter((_, i) => i < index));
    const itemHeight = Calendar.itemHeight(data[index]);
    const entryAdditionalActiveHeight = Platform.OS === 'android' ? 21 : 20;
    const itemEnd = itemStart + itemHeight + entryAdditionalActiveHeight;
    const visibleHeight = this.flatListHeight() - keyboardHeight;
    if (
      this.currentScrollPosition !== undefined &&
      this.currentScrollPosition !== null &&
      itemStart > this.currentScrollPosition &&
      itemEnd < this.currentScrollPosition + visibleHeight
    ) {
      return;
    }
    const offset = itemStart - (visibleHeight - itemHeight) / 2;
    invariant(this.flatList, 'flatList should be set');
    this.flatList.scrollToOffset({ offset, animated: true });
  }

  allHeightsMeasured = (
    nodesToMeasure: $ReadOnlyArray<NodeToMeasure>,
    newHeights: Map<string, number>,
  ) => {
    if (nodesToMeasure !== this.state.nodesToMeasure) {
      return;
    }
    this.nodeHeights = newHeights;
    this.mergeHeightsIntoListData();
  };

  onViewableItemsChanged = (info: {
    viewableItems: ViewToken[],
    changed: ViewToken[],
  }) => {
    const ldwh = this.state.listDataWithHeights;
    if (!ldwh) {
      // This indicates the listData was cleared (set to null) right before this
      // callback was called. Since this leads to the FlatList getting cleared,
      // we'll just ignore this callback.
      return;
    }

    const visibleEntries = {};
    for (let token of info.viewableItems) {
      if (token.item.itemType === 'entryInfo') {
        visibleEntries[entryKey(token.item.entryInfo)] = true;
      }
    }
    this.latestExtraData = {
      activeEntries: _pickBy((_, key: string) => {
        if (visibleEntries[key]) {
          return true;
        }
        // We don't automatically set scrolled-away entries to be inactive
        // because entries can be out-of-view at creation time if they need to
        // be scrolled into view (see onEnterEntryEditMode). If Entry could
        // distinguish the reasons its active prop gets set to false, it could
        // differentiate the out-of-view case from the something-pressed case,
        // and then we could set scrolled-away entries to be inactive without
        // worrying about this edge case. Until then...
        const foundItem = _find(
          item => item.entryInfo && entryKey(item.entryInfo) === key,
        )(ldwh);
        return !!foundItem;
      })(this.latestExtraData.activeEntries),
      visibleEntries,
    };

    const topLoader = _find({ key: 'TopLoader' })(info.viewableItems);
    if (this.topLoaderWaitingToLeaveView && !topLoader) {
      this.topLoaderWaitingToLeaveView = false;
      this.topLoadingFromScroll = null;
    }

    const bottomLoader = _find({ key: 'BottomLoader' })(info.viewableItems);
    if (this.bottomLoaderWaitingToLeaveView && !bottomLoader) {
      this.bottomLoaderWaitingToLeaveView = false;
      this.bottomLoadingFromScroll = null;
    }

    if (
      !this.state.readyToShowList &&
      !this.topLoaderWaitingToLeaveView &&
      !this.bottomLoaderWaitingToLeaveView &&
      info.viewableItems.length > 0
    ) {
      this.setState({
        readyToShowList: true,
        extraData: this.latestExtraData,
      });
    }

    if (
      topLoader &&
      !this.topLoaderWaitingToLeaveView &&
      !this.topLoadingFromScroll
    ) {
      this.topLoaderWaitingToLeaveView = true;
      const start = dateFromString(this.props.startDate);
      start.setDate(start.getDate() - 31);
      const startDate = dateString(start);
      const endDate = this.props.endDate;
      this.topLoadingFromScroll = {
        startDate,
        endDate,
        filters: this.props.calendarFilters,
      };
      this.loadMoreAbove();
    } else if (
      bottomLoader &&
      !this.bottomLoaderWaitingToLeaveView &&
      !this.bottomLoadingFromScroll
    ) {
      this.bottomLoaderWaitingToLeaveView = true;
      const end = dateFromString(this.props.endDate);
      end.setDate(end.getDate() + 31);
      const endDate = dateString(end);
      const startDate = this.props.startDate;
      this.bottomLoadingFromScroll = {
        startDate,
        endDate,
        filters: this.props.calendarFilters,
      };
      this.loadMoreBelow();
    }
  };

  dispatchCalendarQueryUpdate(calendarQuery: CalendarQuery) {
    this.props.dispatchActionPromise(
      updateCalendarQueryActionTypes,
      this.props.updateCalendarQuery(calendarQuery),
    );
  }

  loadMoreAbove = _throttle(() => {
    if (
      this.topLoadingFromScroll &&
      this.topLoaderWaitingToLeaveView &&
      this.props.connectionStatus === 'connected'
    ) {
      this.dispatchCalendarQueryUpdate(this.topLoadingFromScroll);
    }
  }, 1000);

  loadMoreBelow = _throttle(() => {
    if (
      this.bottomLoadingFromScroll &&
      this.bottomLoaderWaitingToLeaveView &&
      this.props.connectionStatus === 'connected'
    ) {
      this.dispatchCalendarQueryUpdate(this.bottomLoadingFromScroll);
    }
  }, 1000);

  onScroll = (event: { +nativeEvent: { +contentOffset: { +y: number } } }) => {
    this.currentScrollPosition = event.nativeEvent.contentOffset.y;
  };

  // When the user "flicks" the scroll view, this callback gets triggered after
  // the scrolling ends
  onMomentumScrollEnd = () => {
    this.setState({ extraData: this.latestExtraData });
  };

  // This callback gets triggered when the user lets go of scrolling the scroll
  // view, regardless of whether it was a "flick" or a pan
  onScrollEndDrag = () => {
    // We need to figure out if this was a flick or not. If it's a flick, we'll
    // let onMomentumScrollEnd handle it once scroll position stabilizes
    const currentScrollPosition = this.currentScrollPosition;
    setTimeout(() => {
      if (this.currentScrollPosition === currentScrollPosition) {
        this.setState({ extraData: this.latestExtraData });
      }
    }, 50);
  };

  onSaveEntry = () => {
    const entryKeys = Object.keys(this.latestExtraData.activeEntries);
    if (entryKeys.length === 0) {
      return;
    }
    const entryRef = this.entryRefs.get(entryKeys[0]);
    if (entryRef) {
      entryRef.completeEdit();
    }
  };
}

const styles = {
  container: {
    backgroundColor: 'listBackground',
    flex: 1,
  },
  flatList: {
    backgroundColor: 'listBackground',
    flex: 1,
  },
  keyboardAvoidingViewContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  keyboardAvoidingView: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sectionHeader: {
    backgroundColor: 'listSeparator',
    borderBottomWidth: 2,
    borderColor: 'listBackground',
    height: 31,
  },
  sectionHeaderText: {
    color: 'listSeparatorLabel',
    fontWeight: 'bold',
    padding: 5,
  },
  weekendSectionHeader: {},
};
const stylesSelector = styleSelector(styles);

const loadingStatusSelector = createLoadingStatusSelector(
  updateCalendarQueryActionTypes,
);
const activeTabSelector = createActiveTabSelector(CalendarRouteName);
const activeThreadPickerSelector = createIsForegroundSelector(
  ThreadPickerModalRouteName,
);
export default connectNav((context: ?NavContextType) => ({
  calendarActive:
    activeTabSelector(context) || activeThreadPickerSelector(context),
}))(
  connect(
    (state: AppState) => ({
      listData: calendarListData(state),
      startDate: state.navInfo.startDate,
      endDate: state.navInfo.endDate,
      calendarFilters: state.calendarFilters,
      dimensions: state.dimensions,
      loadingStatus: loadingStatusSelector(state),
      connectionStatus: state.connection.status,
      colors: colorsSelector(state),
      styles: stylesSelector(state),
    }),
    { updateCalendarQuery },
  )(Calendar),
);
