// @flow

import type { GlobalTheme } from '../types/themes';
import type { Styles } from '../types/styles';
import type { AppState } from '../redux/redux-setup';
import type { NavPlusRedux } from '../types/selector-types';

import { StyleSheet } from 'react-native';
import { createSelector } from 'reselect';
import PropTypes from 'prop-types';

import { backgroundIsDarkSelector } from '../navigation/nav-selectors';

const light = Object.freeze({
  redButton: '#BB8888',
  greenButton: '#88BB88',
  mintButton: '#44CC99',
  redText: '#AA0000',
  greenText: 'green',
  link: '#036AFF',
  panelBackground: '#E9E9EF',
  panelBackgroundLabel: '#888888',
  panelForeground: 'white',
  panelForegroundBorder: '#CCCCCC',
  panelForegroundLabel: 'black',
  panelForegroundSecondaryLabel: '#333333',
  panelForegroundTertiaryLabel: '#888888',
  panelIosHighlightUnderlay: '#EEEEEEDD',
  panelSecondaryForeground: '#F5F5F5',
  panelSecondaryForegroundBorder: '#D1D1D6',
  modalForeground: 'white',
  modalForegroundBorder: '#CCCCCC',
  modalForegroundLabel: 'black',
  modalForegroundSecondaryLabel: '#888888',
  modalForegroundTertiaryLabel: '#AAAAAA',
  modalBackground: '#EEEEEE',
  modalBackgroundLabel: '#333333',
  modalBackgroundSecondaryLabel: '#AAAAAA',
  modalIosHighlightUnderlay: '#CCCCCCDD',
  modalSubtext: '#CCCCCC',
  modalSubtextLabel: '#555555',
  modalButton: '#BBBBBB',
  modalButtonLabel: 'black',
  modalContrastBackground: 'black',
  modalContrastForegroundLabel: 'white',
  modalContrastOpacity: 0.7,
  listForegroundLabel: 'black',
  listForegroundSecondaryLabel: '#333333',
  listForegroundTertiaryLabel: '#666666',
  listForegroundQuaternaryLabel: '#AAAAAA',
  listBackground: 'white',
  listBackgroundLabel: 'black',
  listBackgroundSecondaryLabel: '#444444',
  listBackgroundTernaryLabel: '#999999',
  listSeparator: '#EEEEEE',
  listSeparatorLabel: '#555555',
  listInputBar: '#E2E2E2',
  listInputBorder: '#AAAAAAAA',
  listInputButton: '#888888',
  listInputBackground: '#DDDDDD',
  listIosHighlightUnderlay: '#DDDDDDDD',
  listSearchBackground: '#DDDDDD',
  listSearchIcon: '#AAAAAA',
  listChatBubble: '#DDDDDDBB',
});
export type Colors = $Exact<typeof light>;

const colorsPropType = PropTypes.objectOf(
  PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
);

const dark: Colors = Object.freeze({
  redButton: '#FF4444',
  greenButton: '#44BB44',
  mintButton: '#44CC99',
  redText: '#FF4444',
  greenText: '#44FF44',
  link: '#129AFF',
  panelBackground: '#1C1C1E',
  panelBackgroundLabel: '#C7C7CC',
  panelForeground: '#3A3A3C',
  panelForegroundBorder: '#2C2C2E',
  panelForegroundLabel: 'white',
  panelForegroundSecondaryLabel: '#CCCCCC',
  panelForegroundTertiaryLabel: '#AAAAAA',
  panelIosHighlightUnderlay: '#444444DD',
  panelSecondaryForeground: '#333333',
  panelSecondaryForegroundBorder: '#666666',
  modalForeground: '#1C1C1E',
  modalForegroundBorder: '#1C1C1E',
  modalForegroundLabel: 'white',
  modalForegroundSecondaryLabel: '#AAAAAA',
  modalForegroundTertiaryLabel: '#666666',
  modalBackground: '#2C2C2E',
  modalBackgroundLabel: '#CCCCCC',
  modalBackgroundSecondaryLabel: '#555555',
  modalIosHighlightUnderlay: '#AAAAAA88',
  modalSubtext: '#444444',
  modalSubtextLabel: '#AAAAAA',
  modalButton: '#666666',
  modalButtonLabel: 'white',
  modalContrastBackground: 'white',
  modalContrastForegroundLabel: 'black',
  modalContrastOpacity: 0.85,
  listForegroundLabel: 'white',
  listForegroundSecondaryLabel: '#CCCCCC',
  listForegroundTertiaryLabel: '#999999',
  listForegroundQuaternaryLabel: '#555555',
  listBackground: '#1C1C1E',
  listBackgroundLabel: '#C7C7CC',
  listBackgroundSecondaryLabel: '#BBBBBB',
  listBackgroundTernaryLabel: '#888888',
  listSeparator: '#3A3A3C',
  listSeparatorLabel: '#EEEEEE',
  listInputBar: '#555555',
  listInputBorder: '#333333',
  listInputButton: '#AAAAAA',
  listInputBackground: '#38383C',
  listIosHighlightUnderlay: '#BBBBBB88',
  listSearchBackground: '#555555',
  listSearchIcon: '#AAAAAA',
  listChatBubble: '#444444DD',
});
const colors = { light, dark };

const colorsSelector: (state: AppState) => Colors = createSelector(
  (state: AppState) => state.globalThemeInfo.activeTheme,
  (theme: ?GlobalTheme) => {
    const explicitTheme = theme ? theme : 'light';
    return colors[explicitTheme];
  },
);

const overlayColorsSelector: (input: NavPlusRedux) => Colors = createSelector(
  backgroundIsDarkSelector,
  (backgroundIsDark: boolean) => {
    const syntheticTheme = backgroundIsDark ? 'dark' : 'light';
    return colors[syntheticTheme];
  },
);

const magicStrings = new Set();
for (let theme in colors) {
  for (let magicString in colors[theme]) {
    magicStrings.add(magicString);
  }
}

// Distinct type needed here because we replace type of some fields with strings
type InStyles = { [name: string]: { [field: string]: number | string } };

function stylesFromColors<IS: InStyles, +OS: Styles>(
  obj: IS,
  themeColors: Colors,
): OS {
  const result = {};
  for (let key in obj) {
    const style = obj[key];
    const filledInStyle = { ...style };
    for (let styleKey in style) {
      const styleValue = style[styleKey];
      if (magicStrings.has(styleValue)) {
        const mapped = themeColors[styleValue];
        if (mapped) {
          filledInStyle[styleKey] = mapped;
        }
      }
    }
    result[key] = filledInStyle;
  }
  return StyleSheet.create(result);
}

function styleSelector<IS: InStyles, +OS: Styles>(
  obj: IS,
): (state: AppState) => OS {
  return createSelector(colorsSelector, (themeColors: Colors) =>
    stylesFromColors(obj, themeColors),
  );
}

function overlayStyleSelector<IS: InStyles, +OS: Styles>(
  obj: IS,
): (input: NavPlusRedux) => OS {
  return createSelector(overlayColorsSelector, (themeColors: Colors) =>
    stylesFromColors(obj, themeColors),
  );
}

export {
  colorsPropType,
  colors,
  colorsSelector,
  overlayColorsSelector,
  styleSelector,
  overlayStyleSelector,
};
