// @flow

import type { ThreadInfo, SidebarInfo } from 'lib/types/thread-types';
import type { RootNavigationProp } from '../navigation/root-navigator.react';
import type { NavigationRoute } from '../navigation/route-names';

import * as React from 'react';
import { TextInput, FlatList, StyleSheet } from 'react-native';

import { sidebarInfoSelector } from 'lib/selectors/thread-selectors';
import SearchIndex from 'lib/shared/search-index';
import { threadSearchText } from 'lib/shared/thread-utils';
import sleep from 'lib/utils/sleep';

import { useSelector } from '../redux/redux-utils';
import Modal from '../components/modal.react';
import Search from '../components/search.react';
import { useIndicatorStyle } from '../themes/colors';

export type SidebarListModalParams = {|
  +threadInfo: ThreadInfo,
|};

function keyExtractor(sidebarInfo: SidebarInfo) {
  return sidebarInfo.threadInfo.id;
}
function getItemLayout(data: ?$ReadOnlyArray<SidebarInfo>, index: number) {
  return { length: 24, offset: 24 * index, index };
}

type Props = {|
  +navigation: RootNavigationProp<'SidebarListModal'>,
  +route: NavigationRoute<'SidebarListModal'>,
|};
function SidebarListModal(props: Props) {
  const threadID = props.route.params.threadInfo.id;
  const sidebarInfos = useSelector(
    (state) => sidebarInfoSelector(state)[threadID] ?? [],
  );

  const [searchState, setSearchState] = React.useState({
    text: '',
    results: new Set<string>(),
  });

  const listData = React.useMemo(() => {
    if (!searchState.text) {
      return sidebarInfos;
    }
    return sidebarInfos.filter(({ threadInfo }) =>
      searchState.results.has(threadInfo.id),
    );
  }, [sidebarInfos, searchState]);

  const userInfos = useSelector((state) => state.userStore.userInfos);
  const searchIndex = React.useMemo(() => {
    const index = new SearchIndex();
    for (const sidebarInfo of sidebarInfos) {
      const { threadInfo } = sidebarInfo;
      index.addEntry(threadInfo.id, threadSearchText(threadInfo, userInfos));
    }
    return index;
  }, [sidebarInfos, userInfos]);
  React.useEffect(() => {
    setSearchState((curState) => ({
      ...curState,
      results: new Set(searchIndex.getSearchResults(curState.text)),
    }));
  }, [searchIndex]);

  const onChangeSearchText = React.useCallback(
    (searchText: string) =>
      setSearchState({
        text: searchText,
        results: new Set(searchIndex.getSearchResults(searchText)),
      }),
    [searchIndex],
  );

  const searchTextInputRef = React.useRef();
  const setSearchTextInputRef = React.useCallback(
    async (textInput: ?React.ElementRef<typeof TextInput>) => {
      searchTextInputRef.current = textInput;
      if (!textInput) {
        return;
      }
      await sleep(50);
      if (searchTextInputRef.current) {
        searchTextInputRef.current.focus();
      }
    },
    [],
  );

  const renderItem = React.useCallback(() => {
    return null;
  }, []);

  const { navigation } = props;
  const indicatorStyle = useIndicatorStyle();
  return (
    <Modal navigation={navigation}>
      <Search
        searchText={searchState.text}
        onChangeText={onChangeSearchText}
        containerStyle={styles.search}
        placeholder="Search sidebars"
        ref={setSearchTextInputRef}
      />
      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        indicatorStyle={indicatorStyle}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  search: {
    marginBottom: 8,
  },
});

export default SidebarListModal;