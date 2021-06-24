// @flow

import invariant from 'invariant';
import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import shallowequal from 'shallowequal';

import type { Shape } from 'lib/types/core';

import type { LayoutEvent } from '../types/react-native';

const measureBatchSize = 50;

type MergedItemPair<Item, MergedItem> = {|
  +item: Item,
  +mergedItem: MergedItem,
|};

type Props<Item, MergedItem> = {
  // What we want to render
  +listData: ?$ReadOnlyArray<Item>,
  // Every item should have an ID. We use this ID to cache the result of calling
  // mergeItemWithHeight below, and only update it if the input item changes,
  // mergeItemWithHeight changes, or any extra props we get passed change
  +itemToID: (Item) => string,
  // Only measurable items should return a measureKey.
  // Falsey keys won't get measured, but will still get passed through
  // mergeItemWithHeight with height undefined
  // Make sure that if an item's height changes, its measure key does too!
  +itemToMeasureKey: (Item) => ?string,
  // The "dummy" is the component whose height we will be measuring
  // We will only call this with items for which itemToMeasureKey returns truthy
  +itemToDummy: (Item) => React.Element<any>,
  // Once we have the height, we need to merge it into the item
  +mergeItemWithHeight: (item: Item, height: ?number) => MergedItem,
  // We'll pass our results here when we're done
  +allHeightsMeasured: (
    items: $ReadOnlyArray<MergedItem>,
    measuredHeights: $ReadOnlyMap<string, number>,
  ) => mixed,
  +initialMeasuredHeights?: ?$ReadOnlyMap<string, number>,
  ...
};
type State<Item, MergedItem> = {|
  // These are the dummies currently being rendered
  +currentlyMeasuring: $ReadOnlyArray<{|
    +measureKey: string,
    +dummy: React.Element<any>,
  |}>,
  // When certain parameters change we need to remeasure everything. In order to
  // avoid considering any onLayouts that got queued before we issued the
  // remeasure, we increment the "iteration" and only count onLayouts with the
  // right value
  +iteration: number,
  // We cache the measured heights here, keyed by measure key
  +measuredHeights: Map<string, number>,
  // We cache the results of calling mergeItemWithHeight on measured items after
  // measuring their height, keyed by ID
  +measurableItems: Map<string, MergedItemPair<Item, MergedItem>>,
  // We cache the results of calling mergeItemWithHeight on items that aren't
  // measurable (eg. itemToKey reurns falsey), keyed by ID
  +unmeasurableItems: Map<string, MergedItemPair<Item, MergedItem>>,
|};
class NodeHeightMeasurer<Item, MergedItem> extends React.PureComponent<
  Props<Item, MergedItem>,
  State<Item, MergedItem>,
> {
  containerWidth: ?number;

  constructor(props: Props<Item, MergedItem>) {
    super(props);

    const {
      listData,
      itemToID,
      itemToMeasureKey,
      mergeItemWithHeight,
      initialMeasuredHeights,
    } = props;
    const unmeasurableItems = new Map();
    const measurableItems = new Map();
    const measuredHeights = initialMeasuredHeights
      ? new Map(initialMeasuredHeights)
      : new Map();

    if (listData) {
      for (const item of listData) {
        const measureKey = itemToMeasureKey(item);
        const height = measureKey ? measuredHeights.get(measureKey) : undefined;
        if (measureKey && height === undefined) {
          continue;
        }
        const mergedItem = mergeItemWithHeight(item, height);
        const itemsMap = measureKey ? measurableItems : unmeasurableItems;
        itemsMap.set(itemToID(item), { item, mergedItem });
      }
    }

    this.state = {
      currentlyMeasuring: [],
      iteration: 0,
      measuredHeights,
      measurableItems,
      unmeasurableItems,
    };
  }

  static getDerivedStateFromProps(
    props: Props<Item, MergedItem>,
    state: State<Item, MergedItem>,
  ) {
    return NodeHeightMeasurer.getPossibleStateUpdateForNextBatch<
      Item,
      MergedItem,
    >(props, state);
  }

  static getPossibleStateUpdateForNextBatch<InnerItem, InnerMergedItem>(
    props: Props<InnerItem, InnerMergedItem>,
    state: State<InnerItem, InnerMergedItem>,
  ): ?Shape<State<InnerItem, InnerMergedItem>> {
    const { currentlyMeasuring, measuredHeights } = state;

    let stillMeasuring = false;
    for (const { measureKey } of currentlyMeasuring) {
      const height = measuredHeights.get(measureKey);
      if (height === null || height === undefined) {
        stillMeasuring = true;
        break;
      }
    }
    if (stillMeasuring) {
      return null;
    }

    const { listData, itemToMeasureKey, itemToDummy } = props;

    const toMeasure = new Map();
    if (listData) {
      for (const item of listData) {
        const measureKey = itemToMeasureKey(item);
        if (measureKey === null || measureKey === undefined) {
          continue;
        }
        const height = measuredHeights.get(measureKey);
        if (height !== null && height !== undefined) {
          continue;
        }
        const dummy = itemToDummy(item);
        toMeasure.set(measureKey, dummy);
        if (toMeasure.size === measureBatchSize) {
          break;
        }
      }
    }
    if (currentlyMeasuring.length === 0 && toMeasure.size === 0) {
      return null;
    }

    const nextCurrentlyMeasuring = [];
    for (const [measureKey, dummy] of toMeasure) {
      nextCurrentlyMeasuring.push({ measureKey, dummy });
    }
    return {
      currentlyMeasuring: nextCurrentlyMeasuring,
      measuredHeights: new Map(measuredHeights),
    };
  }

  possiblyIssueNewBatch() {
    const stateUpdate = NodeHeightMeasurer.getPossibleStateUpdateForNextBatch(
      this.props,
      this.state,
    );
    if (stateUpdate) {
      this.setState(stateUpdate);
    }
  }

  componentDidMount() {
    this.triggerCallback(
      this.state.measurableItems,
      this.state.unmeasurableItems,
      this.state.measuredHeights,
      false,
    );
  }

  triggerCallback(
    measurableItems: Map<string, MergedItemPair<Item, MergedItem>>,
    unmeasurableItems: Map<string, MergedItemPair<Item, MergedItem>>,
    measuredHeights: Map<string, number>,
    mustTrigger: boolean,
  ) {
    const {
      listData,
      itemToID,
      itemToMeasureKey,
      allHeightsMeasured,
    } = this.props;

    if (!listData) {
      return;
    }

    const result = [];
    for (const item of listData) {
      const id = itemToID(item);
      const measureKey = itemToMeasureKey(item);
      if (measureKey !== null && measureKey !== undefined) {
        const measurableItem = measurableItems.get(id);
        if (!measurableItem && !mustTrigger) {
          return;
        }
        invariant(
          measurableItem,
          `currentlyMeasuring empty but no result for ${id}`,
        );
        result.push(measurableItem.mergedItem);
      } else {
        const unmeasurableItem = unmeasurableItems.get(id);
        if (!unmeasurableItem && !mustTrigger) {
          return;
        }
        invariant(
          unmeasurableItem,
          `currentlyMeasuring empty but no result for ${id}`,
        );
        result.push(unmeasurableItem.mergedItem);
      }
    }

    allHeightsMeasured(result, measuredHeights);
  }

  componentDidUpdate(
    prevProps: Props<Item, MergedItem>,
    prevState: State<Item, MergedItem>,
  ) {
    const {
      listData,
      itemToID,
      itemToMeasureKey,
      itemToDummy,
      mergeItemWithHeight,
      allHeightsMeasured,
      ...rest
    } = this.props;
    const {
      listData: prevListData,
      itemToID: prevItemToID,
      itemToMeasureKey: prevItemToMeasureKey,
      itemToDummy: prevItemToDummy,
      mergeItemWithHeight: prevMergeItemWithHeight,
      allHeightsMeasured: prevAllHeightsMeasured,
      ...prevRest
    } = prevProps;
    const restShallowEqual = shallowequal(rest, prevRest);
    const measurementJustCompleted =
      this.state.currentlyMeasuring.length === 0 &&
      prevState.currentlyMeasuring.length !== 0;

    let incrementIteration = false;
    const nextMeasuredHeights = new Map(this.state.measuredHeights);
    let measuredHeightsChanged = false;
    const nextMeasurableItems = new Map(this.state.measurableItems);
    let measurableItemsChanged = false;
    const nextUnmeasurableItems = new Map(this.state.unmeasurableItems);
    let unmeasurableItemsChanged = false;

    if (
      itemToMeasureKey !== prevItemToMeasureKey ||
      itemToDummy !== prevItemToDummy
    ) {
      incrementIteration = true;
      nextMeasuredHeights.clear();
      measuredHeightsChanged = true;
    }
    if (
      itemToID !== prevItemToID ||
      itemToMeasureKey !== prevItemToMeasureKey ||
      itemToDummy !== prevItemToDummy ||
      mergeItemWithHeight !== prevMergeItemWithHeight ||
      !restShallowEqual
    ) {
      if (nextMeasurableItems.size > 0) {
        nextMeasurableItems.clear();
        measurableItemsChanged = true;
      }
    }
    if (
      itemToID !== prevItemToID ||
      itemToMeasureKey !== prevItemToMeasureKey ||
      mergeItemWithHeight !== prevMergeItemWithHeight ||
      !restShallowEqual
    ) {
      if (nextUnmeasurableItems.size > 0) {
        nextUnmeasurableItems.clear();
        unmeasurableItemsChanged = true;
      }
    }

    if (
      measurementJustCompleted ||
      listData !== prevListData ||
      measuredHeightsChanged ||
      measurableItemsChanged ||
      unmeasurableItemsChanged
    ) {
      const currentMeasurableItems = new Map();
      const currentUnmeasurableItems = new Map();
      if (listData) {
        for (const item of listData) {
          const id = itemToID(item);
          const measureKey = itemToMeasureKey(item);
          if (measureKey !== null && measureKey !== undefined) {
            currentMeasurableItems.set(id, item);
          } else {
            currentUnmeasurableItems.set(id, item);
          }
        }
      }

      for (const [id, { item }] of nextMeasurableItems) {
        const currentItem = currentMeasurableItems.get(id);
        if (!currentItem) {
          measurableItemsChanged = true;
          nextMeasurableItems.delete(id);
        } else if (currentItem !== item) {
          measurableItemsChanged = true;
          const measureKey = itemToMeasureKey(currentItem);
          if (measureKey === null || measureKey === undefined) {
            nextMeasurableItems.delete(id);
            continue;
          }
          const height = nextMeasuredHeights.get(measureKey);
          if (height === null || height === undefined) {
            nextMeasurableItems.delete(id);
            continue;
          }
          const mergedItem = mergeItemWithHeight(currentItem, height);
          nextMeasurableItems.set(id, { item: currentItem, mergedItem });
        }
      }
      for (const [id, item] of currentMeasurableItems) {
        if (nextMeasurableItems.has(id)) {
          continue;
        }
        const measureKey = itemToMeasureKey(item);
        if (measureKey === null || measureKey === undefined) {
          continue;
        }
        const height = nextMeasuredHeights.get(measureKey);
        if (height === null || height === undefined) {
          continue;
        }
        const mergedItem = mergeItemWithHeight(item, height);
        nextMeasurableItems.set(id, { item, mergedItem });
        measurableItemsChanged = true;
      }

      for (const [id, { item }] of nextUnmeasurableItems) {
        const currentItem = currentUnmeasurableItems.get(id);
        if (!currentItem) {
          unmeasurableItemsChanged = true;
          nextUnmeasurableItems.delete(id);
        } else if (currentItem !== item) {
          unmeasurableItemsChanged = true;
          const measureKey = itemToMeasureKey(currentItem);
          if (measureKey !== null && measureKey !== undefined) {
            nextUnmeasurableItems.delete(id);
            continue;
          }
          const mergedItem = mergeItemWithHeight(currentItem, undefined);
          nextUnmeasurableItems.set(id, { item: currentItem, mergedItem });
        }
      }
      for (const [id, item] of currentUnmeasurableItems) {
        if (nextUnmeasurableItems.has(id)) {
          continue;
        }
        const measureKey = itemToMeasureKey(item);
        if (measureKey !== null && measureKey !== undefined) {
          continue;
        }
        const mergedItem = mergeItemWithHeight(item, undefined);
        nextUnmeasurableItems.set(id, { item, mergedItem });
        unmeasurableItemsChanged = true;
      }
    }

    const stateUpdate = {};
    if (incrementIteration) {
      stateUpdate.iteration = this.state.iteration + 1;
    }
    if (measuredHeightsChanged) {
      stateUpdate.measuredHeights = nextMeasuredHeights;
    }
    if (measurableItemsChanged) {
      stateUpdate.measurableItems = nextMeasurableItems;
    }
    if (unmeasurableItemsChanged) {
      stateUpdate.unmeasurableItems = nextUnmeasurableItems;
    }
    if (Object.keys(stateUpdate).length > 0) {
      this.setState(stateUpdate);
    }

    if (measurementJustCompleted || !shallowequal(this.props, prevProps)) {
      this.triggerCallback(
        nextMeasurableItems,
        nextUnmeasurableItems,
        nextMeasuredHeights,
        measurementJustCompleted,
      );
    }
  }

  onContainerLayout = (event: LayoutEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > height) {
      // We currently only use NodeHeightMeasurer on interfaces that are
      // portrait-locked. If we expand beyond that we'll need to rethink this
      return;
    }
    if (this.containerWidth === undefined) {
      this.containerWidth = width;
    } else if (this.containerWidth !== width) {
      this.containerWidth = width;
      this.setState((innerPrevState) => ({
        iteration: innerPrevState.iteration + 1,
        measuredHeights: new Map(),
        measurableItems: new Map(),
      }));
    }
  };

  onDummyLayout(measureKey: string, iteration: number, event: LayoutEvent) {
    if (iteration !== this.state.iteration) {
      return;
    }
    const { height } = event.nativeEvent.layout;
    this.state.measuredHeights.set(measureKey, height);
    this.possiblyIssueNewBatch();
  }

  render() {
    const { currentlyMeasuring, iteration } = this.state;
    const dummies = currentlyMeasuring.map(({ measureKey, dummy }) => {
      const { children } = dummy.props;
      const style = [dummy.props.style, styles.dummy];
      const onLayout = (event) =>
        this.onDummyLayout(measureKey, iteration, event);
      const node = React.cloneElement(dummy, {
        style,
        onLayout,
        children,
      });
      return <React.Fragment key={measureKey}>{node}</React.Fragment>;
    });
    return <View onLayout={this.onContainerLayout}>{dummies}</View>;
  }
}

const styles = StyleSheet.create({
  dummy: {
    opacity: 0,
    position: 'absolute',
  },
});

export default NodeHeightMeasurer;
