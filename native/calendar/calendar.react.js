// @flow

import type { EntryInfo } from 'lib/types/entry-types';
import { entryInfoPropType } from 'lib/types/entry-types';
import type { AppState } from '../redux-setup';
import type { CalendarItem } from '../selectors/entry-selectors';

import React from 'react';
import { View, StyleSheet, Text, SectionList } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import invariant from 'invariant';

import { entryKey } from 'lib/shared/entry-utils';
import { prettyDate } from 'lib/utils/date-utils';

import Entry from './entry.react';
import { contentVerticalOffset } from '../dimensions';
import { calendarSectionListData } from '../selectors/entry-selectors';

class Calendar extends React.PureComponent {

  props: {
    sectionListData: { data: CalendarItem[], key: string }[],
  };
  state: {};
  static propTypes = {
    sectionListData: PropTypes.arrayOf(PropTypes.shape({
      data: PropTypes.arrayOf(PropTypes.shape({
        entryInfo: entryInfoPropType,
        footerForDateString: PropTypes.string,
      })).isRequired,
      key: PropTypes.string.isRequired,
    })).isRequired,
  };

  static navigationOptions = {
    tabBarLabel: 'Calendar',
    tabBarIcon: ({ tintColor }) => (
      <Icon
        name="calendar"
        style={[styles.icon, { color: tintColor }]}
      />
    ),
  };

  renderItem = (row) => {
    if (row.item.entryInfo) {
      return <Entry entryInfo={row.item.entryInfo} />;
    } else {
      return this.renderSectionFooter(row);
    }
  }

  renderSectionHeader = (row) => {
    invariant(row.section.key, "should be set");
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>
          {prettyDate(row.section.key)}
        </Text>
      </View>
    );
  }

  renderSectionFooter = (row) => {
    // Eventually we will pass this function directly into SectionList, but
    // that functionality is only in RN master as of this time, and also there
    // is an issue (RN#13784) where empty sections don't render a footer.
    return (
      <View style={styles.sectionFooter}>
        <Text style={styles.sectionHeaderText}>
          test
        </Text>
      </View>
    );
  }

  keyExtractor = (item: CalendarItem) => {
    if (item.entryInfo) {
      return entryKey(item.entryInfo);
    } else {
      invariant(item.footerForDateString, "should be set");
      return item.footerForDateString + "/footer";
    }
  };

  render() {
    return (
      <SectionList
        sections={this.props.sectionListData}
        renderItem={this.renderItem}
        renderSectionHeader={this.renderSectionHeader}
        keyExtractor={this.keyExtractor}
        style={styles.container}
      />
    );
  }

}

const styles = StyleSheet.create({
  icon: {
    fontSize: 28,
  },
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
    marginTop: contentVerticalOffset,
  },
  sectionHeader: {
    marginTop: 5,
    marginLeft: 2,
    marginRight: 2,
    padding: 5,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#DDDDDD',
  },
  sectionHeaderText: {
    fontWeight: 'bold',
  },
  sectionFooter: {
    marginBottom: 5,
    marginLeft: 2,
    marginRight: 2,
    padding: 5,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#DDDDDD',
  },
});

export default connect(
  (state: AppState) => ({
    entryInfos: state.entryInfos,
    sectionListData: calendarSectionListData(state),
  }),
)(Calendar);
