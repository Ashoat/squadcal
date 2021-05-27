// @flow

import * as React from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { updateLifecycleStateActionType } from 'lib/reducers/lifecycle-state-reducer';
import type { LifecycleState } from 'lib/types/lifecycle-state-types';

import { appBecameInactive } from '../redux/redux-setup';
import { addLifecycleListener } from './lifecycle';

const LifecycleHandler = React.memo<{||}>(() => {
  const dispatch = useDispatch();

  const currentState = useSelector((state) => state.lifecycleState);
  const lastStateRef = React.useRef(currentState);

  const onLifecycleChange = React.useCallback(
    (nextState: ?(LifecycleState | 'unknown')) => {
      if (!nextState || nextState === 'unknown') {
        return;
      }
      const lastState = lastStateRef.current;
      lastStateRef.current = nextState;
      if (nextState !== lastState) {
        dispatch({
          type: updateLifecycleStateActionType,
          payload: nextState,
        });
      }
      if (
        lastState !== 'background' &&
        lastState !== 'inactive' &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        appBecameInactive();
      }
    },
    [lastStateRef, dispatch],
  );

  React.useEffect(() => {
    const subscription = addLifecycleListener(onLifecycleChange);
    return () => subscription.remove();
  }, [onLifecycleChange]);

  return null;
});
LifecycleHandler.displayName = 'LifecycleHandler';

export default LifecycleHandler;
