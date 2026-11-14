import {ThemeProvider} from '@sqlrooms/ui';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import {Room} from './room';

import {configureMonacoLoader} from '@sqlrooms/monaco-editor';
// Core editor + SQL only. The full 'monaco-editor' entry also bundles the
// TypeScript/CSS/HTML/JSON language workers (~15 MB) that SQL never uses.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js';

// `&inline` embeds the worker as a blob so the build stays one file.
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
configureMonacoLoader({monaco, workers: {default: editorWorker}});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="sqlrooms-ui-theme">
      <Room />
    </ThemeProvider>
  </StrictMode>,
);
