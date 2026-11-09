import { createContext, useContext } from 'react';
import type { HelpTab } from './Help';

/** App-wide actions any screen can call: open the help drawer, start the guide. */
export interface Shell {
  openHelp: (tab?: HelpTab) => void;
  startTour: (scope: 'all' | 'screen') => void;
}
export const ShellCtx = createContext<Shell>({ openHelp: () => {}, startTour: () => {} });
export const useShell = () => useContext(ShellCtx);
