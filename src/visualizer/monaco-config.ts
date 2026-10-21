/**
 * Monaco Editor configuration for the constraint language
 * 
 * Provides:
 * - Language registration
 * - Syntax highlighting (tokenization)
 * - Theme configuration
 */

export const LANGUAGE_ID = 'webgme-constraint';

/**
 * Monarch tokenizer for syntax highlighting
 */
export const monarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.constraint',

  keywords: [
    'constraintset', 'constraint', 'for', 'define',
    'forall', 'exists', 'in', 'where',
    'implies', 'and', 'or', 'not',
    'true', 'false', 'null'
  ],

  functions: [
    'count', 'isEmpty',
    'all', 'any', 'unique',
    'reachableVia', 'reachableBy', 'connected',
    'children', 'parent', 'siblings'
  ],

  severities: ['error', 'warning', 'info'],

  operators: [
    '==', '!=', '<=', '>=', '<', '>', '->', '=>'
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],

      [/constraintset/, 'keyword.control'],
      [/constraint/, 'keyword.control'],
      [/\[(?:error|warning|info)\]/, 'keyword.severity'],

      [/[a-z_$][\w$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@functions': 'function',
          '@default': 'identifier'
        }
      }],

      [/[A-Z][\w$]*/, 'type'],

      { include: '@whitespace' },

      [/[{}()\[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': ''
        }
      }],

      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],

      [/[;,.]/, 'delimiter'],

      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/'([^'\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string_double'],
      [/'/, 'string', '@string_single'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment']
    ],

    string_double: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop']
    ],

    string_single: [
      [/[^\\']+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/'/, 'string', '@pop']
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
    ],
  }
};

/**
 * Language configuration
 */
export const languageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/']
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" }
  ],
  folding: {
    markers: {
      start: /^\s*constraintset/,
      end: /^\s*(?=constraintset|$)/
    }
  },
  indentationRules: {
    increaseIndentPattern: /^\s*(constraintset|constraint)\b/,
    decreaseIndentPattern: /^\s*$/
  }
};

/**
 * Dark theme for constraints
 */
export const darkTheme = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'C586C0' },
    { token: 'keyword.control', foreground: 'C586C0', fontStyle: 'bold' },
    { token: 'keyword.severity', foreground: 'DCDCAA' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'function', foreground: 'DCDCAA' },
    { token: 'identifier', foreground: '9CDCFE' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'operator', foreground: 'D4D4D4' },
    { token: 'delimiter', foreground: 'D4D4D4' },
  ],
  colors: {
    'editor.background': '#1E1E1E',
    'editor.foreground': '#D4D4D4',
    'editorLineNumber.foreground': '#858585',
    'editorCursor.foreground': '#AEAFAD',
    'editor.selectionBackground': '#264F78',
    'editor.inactiveSelectionBackground': '#3A3D41'
  }
};

/**
 * Light theme for constraints
 */
export const lightTheme = {
  base: 'vs' as const,
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'AF00DB' },
    { token: 'keyword.control', foreground: 'AF00DB', fontStyle: 'bold' },
    { token: 'keyword.severity', foreground: '795E26' },
    { token: 'type', foreground: '267F99' },
    { token: 'function', foreground: '795E26' },
    { token: 'identifier', foreground: '001080' },
    { token: 'number', foreground: '098658' },
    { token: 'string', foreground: 'A31515' },
    { token: 'comment', foreground: '008000', fontStyle: 'italic' },
    { token: 'operator', foreground: '000000' },
    { token: 'delimiter', foreground: '000000' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#000000',
  }
};

/**
 * Register language with Monaco
 * Call this function with the monaco instance
 */
export function registerConstraintLanguage(monaco: any): void {
  monaco.languages.register({ id: LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, monarchLanguage);

  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, languageConfiguration);

  monaco.editor.defineTheme('constraint-dark', darkTheme);
  monaco.editor.defineTheme('constraint-light', lightTheme);
}

/**
 * Create completion item provider
 */
export function createCompletionProvider(languageServer: any): any {
  return {
    provideCompletionItems: (model: any, position: any) => {
      const text = model.getValue();
      const pos = {
        line: position.lineNumber - 1,
        character: position.column - 1
      };
      
      const completions = languageServer.getCompletions(text, pos);
      
      return {
        suggestions: completions.map((c: any) => ({
          label: c.label,
          kind: mapCompletionKind(c.kind),
          detail: c.detail,
          documentation: c.documentation,
          insertText: c.insertText || c.label,
          insertTextRules: c.insertText?.includes('$') ? 4 : 0
        }))
      };
    }
  };
}

/**
 * Create hover provider
 */
export function createHoverProvider(languageServer: any): any {
  return {
    provideHover: (model: any, position: any) => {
      const text = model.getValue();
      const pos = {
        line: position.lineNumber - 1,
        character: position.column - 1
      };
      
      const hover = languageServer.getHover(text, pos);
      
      if (hover) {
        return {
          contents: [{ value: hover.contents }],
          range: hover.range ? {
            startLineNumber: hover.range.start.line + 1,
            startColumn: hover.range.start.character + 1,
            endLineNumber: hover.range.end.line + 1,
            endColumn: hover.range.end.character + 1
          } : undefined
        };
      }
      return null;
    }
  };
}

function mapCompletionKind(kind: string): number {
  const kinds: Record<string, number> = {
    keyword: 17,
    type: 7,
    property: 9,
    function: 2,
    variable: 5
  };
  return kinds[kind] || 0;
}
